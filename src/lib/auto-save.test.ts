import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAutoSaver, type AutoSaveState } from './auto-save'

describe('createAutoSaver', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  function setup(save = vi.fn(async (v: { n: number }) => v)) {
    const states: AutoSaveState[] = []
    const saver = createAutoSaver({ save, onState: s => states.push(s), delayMs: 500, valid: v => v.n >= 1 && v.n <= 5 })
    saver.markSaved({ n: 1 })
    return { saver, save, states }
  }

  it('saves once after changes settle and reports saved', async () => {
    const { saver, save, states } = setup()
    saver.schedule({ n: 2 }); saver.schedule({ n: 3 })
    await vi.advanceTimersByTimeAsync(500)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith({ n: 3 })
    expect(states.at(-1)).toBe('saved')
  })

  it('does not resend what is already saved', async () => {
    const { saver, save } = setup()
    saver.schedule({ n: 1 })
    await vi.advanceTimersByTimeAsync(500)
    expect(save).not.toHaveBeenCalled()
  })

  it('reports a failure and can retry', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined)
    const { saver, states } = setup(save)
    saver.schedule({ n: 4 })
    await vi.advanceTimersByTimeAsync(500)
    expect(states.at(-1)).toBe('failed')
    await saver.flush()
    expect(states.at(-1)).toBe('saved')
    expect(save).toHaveBeenCalledTimes(2)
  })

  it('never sends an invalid value', async () => {
    const { saver, save, states } = setup()
    saver.schedule({ n: 9 })
    await vi.advanceTimersByTimeAsync(500)
    expect(save).not.toHaveBeenCalled()
    expect(states.at(-1)).toBe('invalid')
  })
})
