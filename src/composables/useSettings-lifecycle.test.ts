import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const lifecycle = vi.hoisted(() => ({ mounts: [] as Array<() => Promise<void>>, unmounts: [] as Array<() => void> }))
vi.mock('vue', async importOriginal => ({
  ...await importOriginal<typeof import('vue')>(),
  onMounted: (fn: () => Promise<void>) => lifecycle.mounts.push(fn),
  onUnmounted: (fn: () => void) => lifecycle.unmounts.push(fn),
  provide: vi.fn(), watch: vi.fn(),
}))
vi.mock('vue-router', () => ({ useRouter: () => ({}), useRoute: () => ({ query: {} }) }))
import { provideSettings } from './useSettings'

let listeners: Map<string, Set<(...args: unknown[]) => void>>
let getStatus: () => Promise<object>
beforeEach(() => {
  vi.stubGlobal('__APP_VERSION__', 'test')
  lifecycle.mounts.length = lifecycle.unmounts.length = 0
  listeners = new Map()
  getStatus = async () => ({})
  const api = new Proxy({}, { get: (_target, key) => {
    if (key === 'on') return (channel: string, callback: (...args: unknown[]) => void) => {
      const set = listeners.get(channel) ?? new Set()
      set.add(callback)
      listeners.set(channel, set)
      return () => set.delete(callback)
    }
    return new Proxy({}, { get: (_target, method) => key === 'app' && method === 'getStatus'
      ? () => getStatus()
      : async () => ({}) })
  } })
  vi.stubGlobal('window', { api, addEventListener: vi.fn(), removeEventListener: vi.fn(), setTimeout })
  vi.stubGlobal('navigator', { userAgent: 'test' })
})
afterEach(() => vi.unstubAllGlobals())
const count = () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0)

describe('Settings IPC lifecycle', () => {
  it('returns to zero subscriptions after each visit', async () => {
    for (let visit = 0; visit < 3; visit++) {
      provideSettings()
      await lifecycle.mounts.at(-1)!()
      expect(count()).toBe(11)
      lifecycle.unmounts.at(-1)!()
      expect(count()).toBe(0)
    }
  })

  it('does not leak subscriptions when mounting completes after navigation away', async () => {
    let resolve!: (value: object) => void
    getStatus = () => new Promise(done => { resolve = done })
    provideSettings()
    const mounting = lifecycle.mounts[0]!()
    lifecycle.unmounts[0]!()
    resolve({})
    await mounting
    expect(count()).toBe(0)
  })
})
