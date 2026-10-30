import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { clearCache, readCache, setCacheScope, useStaleLoad, writeCache } from './stale-cache'

class MemStorage implements Storage {
  private m = new Map<string, string>()
  get length() { return this.m.size }
  clear() { this.m.clear() }
  getItem(k: string) { return this.m.get(k) ?? null }
  key(i: number) { return [...this.m.keys()][i] ?? null }
  removeItem(k: string) { this.m.delete(k) }
  setItem(k: string, v: string) { this.m.set(k, v) }
}

beforeEach(() => { (globalThis as any).localStorage = new MemStorage(); clearCache(); setCacheScope(1) })
const flush = () => new Promise(r => setTimeout(r, 0))

describe('stale cache', () => {
  it('switching user or signing out drops the previous user\'s data', () => {
    writeCache('home', { n: 1 })
    setCacheScope(2)
    expect(readCache('home')).toBeNull()
    setCacheScope(1)
    expect(readCache('home')).toBeNull()
    writeCache('home', { n: 3 })
    setCacheScope(null)
    expect(readCache('home')).toBeNull()
  })

  it('first load shows the skeleton, then data', async () => {
    const s = useStaleLoad('home', async () => ({ n: 5 }))
    expect(s.loading.value).toBe(true)
    await flush(); await nextTick()
    expect(s.loading.value).toBe(false)
    expect(s.data.value).toEqual({ n: 5 })
  })

  it('a repeat visit renders cached data instantly and refreshes quietly', async () => {
    writeCache('home', { n: 1 })
    let resolve!: (v: { n: number }) => void
    const s = useStaleLoad('home', () => new Promise(r => { resolve = r }))
    expect(s.loading.value).toBe(false)
    expect(s.refreshing.value).toBe(true)
    expect(s.data.value).toEqual({ n: 1 })
    resolve({ n: 2 }); await flush()
    expect(s.data.value).toEqual({ n: 2 })
    expect(s.refreshing.value).toBe(false)
  })

  it('a failed refresh keeps the cached data and reports the error', async () => {
    writeCache('home', { n: 1 })
    const s = useStaleLoad('home', async () => { throw new Error('timeout') })
    await flush()
    expect(s.data.value).toEqual({ n: 1 })
    expect(s.error.value).toBe('timeout')
  })

  it('sign-out clears everything', () => {
    writeCache('home', { n: 1 })
    clearCache()
    expect(readCache('home')).toBeNull()
    expect(Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).filter(k => k?.startsWith('uf.cache.v1:'))).toEqual([])
  })
})
