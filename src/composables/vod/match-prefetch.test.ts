import { describe, expect, it, vi } from 'vitest'
import { createPrefetchCache } from './match-prefetch'

describe('match prefetch cache', () => {
  it('shares one in-flight request between hover and click', async () => {
    const load = vi.fn(async (id: number) => ({ id }))
    const c = createPrefetchCache(load)
    const a = c.prefetch(7, 0)
    const b = c.prefetch(7, 10)
    expect(a).toBe(b)
    expect(load).toHaveBeenCalledTimes(1)
    await expect(c.take(7, 20)).resolves.toEqual({ id: 7 })
  })

  it('take() consumes the entry so a later open loads fresh data', async () => {
    const load = vi.fn(async (id: number) => id)
    const c = createPrefetchCache(load)
    c.prefetch(1, 0)
    expect(c.take(1, 5)).toBeDefined()
    expect(c.take(1, 6)).toBeUndefined()
  })

  it('peek() shares a result without consuming it', () => {
    const c = createPrefetchCache(async (id: number) => id)
    const p = c.prefetch(4, 0)
    expect(c.peek(4, 1)).toBe(p)
    expect(c.take(4, 2)).toBe(p)
  })

  it('expires stale entries (signed video URLs age out)', () => {
    const c = createPrefetchCache(async (id: number) => id, 1000)
    c.prefetch(1, 0)
    expect(c.take(1, 1001)).toBeUndefined()
  })

  it('a failed prefetch is dropped so the page retries', async () => {
    let n = 0
    const c = createPrefetchCache(async () => { n++; if (n === 1) throw new Error('timeout'); return 'ok' })
    await expect(c.prefetch(3, 0)).rejects.toThrow('timeout')
    await Promise.resolve()
    expect(c.take(3, 1)).toBeUndefined()
    await expect(c.prefetch(3, 2)).resolves.toBe('ok')
  })

  it('keeps memory bounded', () => {
    const c = createPrefetchCache(async (id: number) => id, 90_000, 3)
    for (let i = 1; i <= 5; i++) c.prefetch(i, i)
    expect(c.size()).toBe(3)
    expect(c.take(1, 10)).toBeUndefined()
    expect(c.take(5, 10)).toBeDefined()
  })
})
