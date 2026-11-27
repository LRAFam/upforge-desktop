import { describe, expect, it, vi } from 'vitest'
import { debouncedSingleFlight, singleFlight } from './single-flight'

describe('singleFlight', () => {
  it('collapses a burst into the running call plus one follow-up', async () => {
    let resolve!: () => void
    const fn = vi.fn(() => new Promise<void>((r) => { resolve = r }))
    const run = singleFlight(fn)
    const first = run()
    for (let i = 0; i < 25; i++) void run()
    expect(fn).toHaveBeenCalledTimes(1)
    resolve()
    await Promise.resolve(); await Promise.resolve()
    expect(fn).toHaveBeenCalledTimes(2)
    resolve()
    await first
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('runs again after a failure', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('ipc')).mockResolvedValue(undefined)
    const run = singleFlight(fn)
    await run()
    await run()
    expect(fn).toHaveBeenCalledTimes(2)
  })
})

describe('debouncedSingleFlight', () => {
  it('turns a burst of update events into one reload', async () => {
    vi.useFakeTimers()
    try {
      const fn = vi.fn(async () => {})
      const trigger = debouncedSingleFlight(fn, 300)
      for (let i = 0; i < 11; i++) { trigger(); await vi.advanceTimersByTimeAsync(50) }
      expect(fn).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(300)
      expect(fn).toHaveBeenCalledTimes(1)
    } finally { vi.useRealTimers() }
  })

  it('cancel drops a pending reload (view unmounted)', async () => {
    vi.useFakeTimers()
    try {
      const fn = vi.fn(async () => {})
      const trigger = debouncedSingleFlight(fn, 300)
      trigger(); trigger.cancel()
      await vi.advanceTimersByTimeAsync(1000)
      expect(fn).not.toHaveBeenCalled()
    } finally { vi.useRealTimers() }
  })
})
