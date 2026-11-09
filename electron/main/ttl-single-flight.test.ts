import { describe, expect, it, vi } from 'vitest'
import { createTtlSingleFlight } from './ttl-single-flight'

describe('createTtlSingleFlight', () => {
  it('joins concurrent callers and reuses the value within the TTL', async () => {
    let t = 0
    const fetcher = vi.fn(async () => ++t)
    const shared = createTtlSingleFlight(fetcher, 2_000, () => 0)
    const results = await Promise.all(Array.from({ length: 5 }, () => shared.get()))
    expect(results).toEqual([1, 1, 1, 1, 1])
    expect(await shared.get()).toBe(1)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('refreshes after the TTL and after invalidate()', async () => {
    let clock = 0
    let n = 0
    const fetcher = vi.fn(async () => ++n)
    const shared = createTtlSingleFlight(fetcher, 2_000, () => clock)
    expect(await shared.get()).toBe(1)
    clock = 1_999
    expect(await shared.get()).toBe(1)
    clock = 2_000
    expect(await shared.get()).toBe(2)
    shared.invalidate()
    expect(await shared.get()).toBe(3)
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it('does not cache a rejected fetch', async () => {
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new Error('flake'))
      .mockResolvedValueOnce('ok')
    const shared = createTtlSingleFlight(fetcher as () => Promise<string>, 2_000, () => 0)
    await expect(shared.get()).rejects.toThrow('flake')
    expect(await shared.get()).toBe('ok')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
