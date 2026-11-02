import { describe, expect, it, vi } from 'vitest'
import { singleFlight } from './single-flight'

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
