import { readFileSync } from 'fs'
import { join } from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildQuitActivity, choiceFromButton, createQuitGuard, decideQuit, type QuitActivity, type QuitChoice } from './quit-guard'

const IDLE: QuitActivity = { recording: false, remuxing: false, finalizing: false, uploadPercents: [] }

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
    const d = decideQuit({ recording: true, remuxing: true, finalizing: false, uploadPercents: [] })
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
    })).toEqual({ recording: false, remuxing: false, finalizing: false, uploadPercents: [45, null] })
  })

  it('reports a remux once, not also as an upload', () => {
    expect(buildQuitActivity({
      recording: true,
      session: { compressing: true, recordingId: 'a' },
      recordings: [{ id: 'a', pipelineStatus: 'uploading', uploadProgress: 0 }],
      jobStages: [],
    })).toEqual({ recording: true, remuxing: true, finalizing: false, uploadPercents: [] })
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

describe('finalising gap after OBS stops', () => {
  afterEach(() => { vi.useRealTimers() })

  it('counts post-match finalising as busy', () => {
    expect(buildQuitActivity({ recording: false, finalizing: true, session: null, recordings: [], jobStages: [] }).finalizing).toBe(true)
    const d = decideQuit({ ...IDLE, finalizing: true })
    expect(d.action).toBe('confirm')
    if (d.action === 'confirm') expect(d.message).toBe('A finished match is being saved — quit anyway?')
  })

  it('quit when finished does not quit between recording stop and upload start', async () => {
    vi.useFakeTimers()
    let current: QuitActivity = { ...IDLE, recording: true }
    const quit = vi.fn()
    const guard = createQuitGuard({ getActivity: () => current, ask: async () => 'wait' as QuitChoice, quit, pollMs: 1000 })
    guard.handleBeforeQuit({ preventDefault: vi.fn() })
    await vi.advanceTimersByTimeAsync(0)
    current = { ...IDLE, finalizing: true }
    await vi.advanceTimersByTimeAsync(3000)
    expect(quit).not.toHaveBeenCalled()
    current = { ...IDLE, uploadPercents: [5] }
    await vi.advanceTimersByTimeAsync(3000)
    expect(quit).not.toHaveBeenCalled()
    current = IDLE
    await vi.advanceTimersByTimeAsync(1000)
    expect(quit).toHaveBeenCalledTimes(1)
  })
})

describe('confirmThen (update install)', () => {
  afterEach(() => { vi.useRealTimers() })
  const make = (activity: QuitActivity, choice: QuitChoice) => {
    const ask = vi.fn(async () => choice)
    const guard = createQuitGuard({ getActivity: () => activity, ask, quit: vi.fn(), pollMs: 1000 })
    return { guard, ask }
  }

  it('runs at once when idle', () => {
    const { guard, ask } = make(IDLE, 'cancel')
    const go = vi.fn()
    guard.confirmThen(go)
    expect(go).toHaveBeenCalledTimes(1)
    expect(ask).not.toHaveBeenCalled()
  })

  it('cancel never runs it', async () => {
    const { guard, ask } = make({ ...IDLE, recording: true }, 'cancel')
    const go = vi.fn()
    guard.confirmThen(go)
    await vi.waitFor(() => expect(ask).toHaveBeenCalled())
    await vi.waitFor(() => expect(guard.isAsking()).toBe(false))
    expect(go).not.toHaveBeenCalled()
  })

  it('quit anyway runs it', async () => {
    const { guard } = make({ ...IDLE, uploadPercents: [10] }, 'quit')
    const go = vi.fn()
    guard.confirmThen(go)
    await vi.waitFor(() => expect(go).toHaveBeenCalledTimes(1))
  })
})

describe('index.ts wiring', () => {
  const source = readFileSync(join(__dirname, 'index.ts'), 'utf8')
  it('checks the guard first in before-quit', () => {
    expect(source).toMatch(/app\.on\('before-quit', \(event\) => \{\n\s+if \(quitGuard\.handleBeforeQuit\(event\)\) return/)
  })
  it('gates the in-app update install on the quit guard', () => {
    expect(source).toMatch(/setInstallGate\(\(proceed\) => quitGuard\.confirmThen\(/)
  })
  it('treats post-match finalising as busy', () => {
    expect(source).toMatch(/finalizing: localMediaWork > 0 \|\| matchFinalizeInFlight !== null/)
  })
  it('clears background timers on will-quit so a cancelled quit keeps them', () => {
    expect(source).not.toMatch(/app\.(once|on)\('before-quit', \(\) => clearInterval/)
  })
})
