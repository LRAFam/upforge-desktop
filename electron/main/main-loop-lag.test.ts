import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCallRateLogger, startMainLoopLagMonitor } from './main-loop-lag'

describe('startMainLoopLagMonitor', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('logs a stall and stays quiet otherwise', async () => {
    let clock = 0
    const warn = vi.fn()
    const stop = startMainLoopLagMonitor(warn, { intervalMs: 1000, warnMs: 1000, now: () => clock })
    for (let i = 0; i < 5; i++) { clock += 1000; await vi.advanceTimersByTimeAsync(1000) }
    expect(warn).not.toHaveBeenCalled()
    clock += 1000 + 5000 // the tick ran 5 s late
    await vi.advanceTimersByTimeAsync(1000)
    expect(warn).toHaveBeenCalledWith('[MainLag] main process was blocked for ~5000 ms')
    stop()
  })
})

describe('createCallRateLogger', () => {
  it('reports a burst once per window', () => {
    let clock = 0
    const warn = vi.fn()
    const hit = createCallRateLogger('recordings:get', warn, { windowMs: 60_000, threshold: 30, now: () => clock })
    for (let i = 0; i < 40; i++) hit()
    clock = 60_000
    hit()
    expect(warn).toHaveBeenCalledWith('[MainLag] recordings:get called 40 times in 60 s')
    clock = 120_000
    hit()
    expect(warn).toHaveBeenCalledTimes(1)
  })
})
