import { readFileSync } from 'fs'
import { join } from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildQuitActivity, choiceFromButton, createQuitGuard, decideQuit, type QuitActivity, type QuitChoice } from './quit-guard'

const IDLE: QuitActivity = { recording: false, remuxing: false, uploadPercents: [] }

describe('decideQuit (card 38)', () => {
  it('quits immediately when idle', () => {
    expect(decideQuit(IDLE)).toEqual({ action: 'quit' })
  })

  it('asks to confirm while a match is recording', () => {
    const d = decideQuit({ ...IDLE, recording: true })
    expect(d.action).toBe('confirm')
    if (d.action === 'confirm') expect(d.message).toBe('A match is recording — quit anyway?')
  })

  it('shows upload progress', () => {
    const d = decideQuit({ ...IDLE, uploadPercents: [45.4] })
    expect(d.action === 'confirm' && d.message).toBe('Upload 45% — quit anyway?')
    const many = decideQuit({ ...IDLE, uploadPercents: [10, null] })
    expect(many.action === 'confirm' && many.message).toBe('2 uploads in progress — quit anyway?')
  })

  it('mentions remuxing and combines reasons', () => {
    const d = decideQuit({ recording: true, remuxing: true, uploadPercents: [] })
    expect(d.action === 'confirm' && d.message).toBe('A match is recording and a recording is being prepared for upload — quit anyway?')
  })

  it('maps dialog buttons to choices', () => {
    expect(choiceFromButton(0)).toBe('quit')
    expect(choiceFromButton(1)).toBe('cancel')
    expect(choiceFromButton(2)).toBe('wait')
    expect(choiceFromButton(99)).toBe('cancel')
  })
})

describe('buildQuitActivity', () => {
  it('counts uploads but not server-side analysis', () => {
    expect(buildQuitActivity({
      recording: false,
      session: null,
      recordings: [
        { id: 'a', pipelineStatus: 'uploading', uploadProgress: 45 },
        { id: 'b', pipelineStatus: 'analysing' },
        { id: 'c', pipelineStatus: 'uploading' },
      ],
      jobStages: ['polling'],
    })).toEqual({ recording: false, remuxing: false, uploadPercents: [45, null] })
  })

  it('reports a remux once, not also as an upload', () => {
    expect(buildQuitActivity({
      recording: true,
      session: { compressing: true, recordingId: 'a' },
      recordings: [{ id: 'a', pipelineStatus: 'uploading', uploadProgress: 0 }],
      jobStages: [],
    })).toEqual({ recording: true, remuxing: true, uploadPercents: [] })
  })
})

describe('createQuitGuard', () => {
  afterEach(() => { vi.useRealTimers() })

  function setup(activity: QuitActivity, choice: QuitChoice, bypass = false) {
    let current = activity
    const quit = vi.fn()
    const ask = vi.fn(async () => choice)
    const guard = createQuitGuard({ getActivity: () => current, ask, quit, bypass: () => bypass, pollMs: 1000 })
    const event = () => ({ preventDefault: vi.fn() })
    return { guard, quit, ask, event, setActivity: (a: QuitActivity) => { current = a } }
  }

  it('lets an idle quit through without a dialog', () => {
    const { guard, ask, event } = setup(IDLE, 'cancel')
    const e = event()
    expect(guard.handleBeforeQuit(e)).toBe(false)
    expect(e.preventDefault).not.toHaveBeenCalled()
    expect(ask).not.toHaveBeenCalled()
  })

  it('cancel keeps the app running', async () => {
    const { guard, quit, event } = setup({ ...IDLE, recording: true }, 'cancel')
    const e = event()
    expect(guard.handleBeforeQuit(e)).toBe(true)
    expect(e.preventDefault).toHaveBeenCalled()
    await vi.waitFor(() => expect(guard.isAsking()).toBe(false))
    expect(quit).not.toHaveBeenCalled()
  })

  it('quit anyway re-issues the quit and lets it through', async () => {
    const { guard, quit, event } = setup({ ...IDLE, recording: true }, 'quit')
    guard.handleBeforeQuit(event())
    await vi.waitFor(() => expect(quit).toHaveBeenCalledTimes(1))
    const second = event()
    expect(guard.handleBeforeQuit(second)).toBe(false)
    expect(second.preventDefault).not.toHaveBeenCalled()
  })

  it('quit when finished waits for the work to end', async () => {
    vi.useFakeTimers()
    const { guard, quit, event, setActivity } = setup({ ...IDLE, uploadPercents: [45] }, 'wait')
    guard.handleBeforeQuit(event())
    await vi.advanceTimersByTimeAsync(0)
    expect(guard.isWaiting()).toBe(true)
    await vi.advanceTimersByTimeAsync(3000)
    expect(quit).not.toHaveBeenCalled()
    setActivity(IDLE)
    await vi.advanceTimersByTimeAsync(1000)
    expect(quit).toHaveBeenCalledTimes(1)
    expect(guard.handleBeforeQuit(event())).toBe(false)
  })

  it('blocks repeat quits while the dialog is open', async () => {
    const { guard, ask, event } = setup({ ...IDLE, recording: true }, 'cancel')
    guard.handleBeforeQuit(event())
    const e = event()
    expect(guard.handleBeforeQuit(e)).toBe(true)
    expect(e.preventDefault).toHaveBeenCalled()
    expect(ask).toHaveBeenCalledTimes(1)
  })

  it('never blocks a bypassed quit (update install)', () => {
    const { guard, ask, event } = setup({ ...IDLE, recording: true }, 'cancel', true)
    expect(guard.handleBeforeQuit(event())).toBe(false)
    expect(ask).not.toHaveBeenCalled()
  })
})

describe('index.ts wiring', () => {
  const source = readFileSync(join(__dirname, 'index.ts'), 'utf8')
  it('checks the guard first in before-quit', () => {
    expect(source).toMatch(/app\.on\('before-quit', \(event\) => \{\n\s+if \(quitGuard\.handleBeforeQuit\(event\)\) return/)
  })
  it('clears background timers on will-quit so a cancelled quit keeps them', () => {
    expect(source).not.toMatch(/app\.(once|on)\('before-quit', \(\) => clearInterval/)
  })
})
