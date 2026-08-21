import { describe, expect, it, vi } from 'vitest'
import { BoundedListCache, ListLoadContractError } from './bounded-list-cache'

describe('BoundedListCache', () => {
  it('reuses a larger fresh result for smaller tab requests', async () => {
    let now = 100
    const cache = new BoundedListCache<number>(1_000, () => now)
    const loader = vi.fn(async (limit: number) => Array.from({ length: limit }, (_, i) => i))

    await expect(cache.load('valorant', 100, loader)).resolves.toHaveLength(100)
    await expect(cache.load('valorant', 10, loader)).resolves.toHaveLength(10)
    expect(loader).toHaveBeenCalledTimes(1)

    now += 1_001
    await cache.load('valorant', 10, loader)
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('deduplicates compatible in-flight loads', async () => {
    let resolve!: (items: number[]) => void
    const loader = vi.fn(() => new Promise<number[]>((done) => { resolve = done }))
    const cache = new BoundedListCache<number>(1_000)
    const large = cache.load('valorant', 100, loader)
    const small = cache.load('valorant', 10, loader)
    resolve(Array.from({ length: 100 }, (_, i) => i))

    await expect(large).resolves.toHaveLength(100)
    await expect(small).resolves.toHaveLength(10)
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('does not cache failed or invalid responses', async () => {
    const cache = new BoundedListCache<number>(1_000)
    const invalid = vi.fn(async () => null as unknown as number[])
    await expect(cache.load('valorant', 10, invalid)).rejects.toBeInstanceOf(ListLoadContractError)
    await expect(cache.load('valorant', 10, invalid)).rejects.toBeInstanceOf(ListLoadContractError)
    expect(invalid).toHaveBeenCalledTimes(2)
  })
})
