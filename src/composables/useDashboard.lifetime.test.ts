/**
 * Home (useDashboard) lifetime harness — counts what a Home instance leaves running.
 *
 * The v3 Home init awaits ~15 IPC/network calls before it starts its 5 s status poll, 1 s timer
 * and ~20 IPC listeners. App.vue re-keys <RouterView> from 'guest' to 'user-N' once its own
 * startup calls return, so Home is remounted mid-init on a normal launch (and on any quick
 * navigation away). Those late timers/listeners used to outlive the view: every leaked Home
 * kept polling and re-loaded recordings/analyses on every 'recordings:updated' /
 * 'dashboard:refresh' — the "app keeps refreshing" report.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, defineComponent, h, type Component } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

vi.mock('../components/CS2StatsPanel.vue', () => ({ default: {} }))
vi.mock('../components/Cs2ValveStatsPanel.vue', () => ({ default: {} }))
vi.mock('../components/CS2SetupPanel.vue', () => ({ default: {} }))
vi.mock('../components/DeadlockStatsPanel.vue', () => ({ default: {} }))
vi.mock('../components/DeadlockDemoPanel.vue', () => ({ default: {} }))
vi.mock('../components/LolStatsPanel.vue', () => ({ default: {} }))

type Listener = (...args: unknown[]) => void
/** Simulates the game taking focus (blur) and the player alt-tabbing back (focus). */
let setFocus: (focused: boolean) => void = () => {}

interface Harness {
  calls: Map<string, number>
  listeners: Map<string, Set<Listener>>
  release: () => void
  emit: (channel: string, ...args: unknown[]) => void
  listenerCount: () => number
  count: (path: string) => number
}

/** window.api stub: every call is counted; every call waits for `release()` (simulates slow startup). */
function installApi(): Harness {
  const calls = new Map<string, number>()
  const listeners = new Map<string, Set<Listener>>()
  let open!: () => void
  const gate = new Promise<void>((r) => { open = r })
  const answers: Record<string, unknown> = {
    'app.getStatus': { authenticated: true, recording: false, currentGame: null, isDev: false, platform: 'win32' },
    'settings.get': { primaryGame: 'valorant' },
    'recordings.get': [],
    'app.getActivityLog': [],
    'trainer.getHistory': { sessions: [], total: 0 },
    'clips.get': [],
    'stats.rrHistory': [],
    'trainer.getCorrelation': [],
  }
  const fn = (path: string) => async (..._args: unknown[]) => {
    calls.set(path, (calls.get(path) ?? 0) + 1)
    await gate
    return answers[path] ?? null
  }
  const ns = (prefix: string): unknown => new Proxy({}, {
    get: (_t, key: string) => fn(`${prefix}.${key}`),
  })
  const api = new Proxy({}, {
    get: (_t, key: string) => {
      if (key === 'on') {
        return (channel: string, cb: Listener) => {
          const set = listeners.get(channel) ?? new Set<Listener>()
          set.add(cb)
          listeners.set(channel, set)
          return () => { set.delete(cb) }
        }
      }
      return ns(key)
    },
  })
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) },
  }
  const domListeners = new Map<string, Set<() => void>>()
  const on = (name: string, cb: () => void) => { const set = domListeners.get(name) ?? new Set(); set.add(cb); domListeners.set(name, set) }
  const off = (name: string, cb: () => void) => { domListeners.get(name)?.delete(cb) }
  const doc = { hidden: false, focused: true, hasFocus: () => doc.focused, addEventListener: on, removeEventListener: off }
  vi.stubGlobal('window', { api, addEventListener: on, removeEventListener: off })
  vi.stubGlobal('document', doc)
  setFocus = (focused: boolean) => {
    doc.focused = focused
    for (const cb of [...(domListeners.get(focused ? 'focus' : 'blur') ?? [])]) cb()
  }
  vi.stubGlobal('localStorage', storage)
  vi.stubGlobal('sessionStorage', storage)
  return {
    calls,
    listeners,
    release: () => open(),
    emit: (channel, ...args) => { for (const cb of [...(listeners.get(channel) ?? [])]) cb(...args) },
    listenerCount: () => [...listeners.values()].reduce((n, s) => n + s.size, 0),
    count: (path) => calls.get(path) ?? 0,
  }
}

/** Minimal DOM-less Vue renderer so the real component lifecycle (onMounted/onUnmounted) runs in node. */
interface Node { children: Node[]; parent: Node | null }
const renderer = createRenderer<Node, Node>({
  createElement: () => ({ children: [], parent: null }),
  createText: () => ({ children: [], parent: null }),
  createComment: () => ({ children: [], parent: null }),
  setText: () => {},
  setElementText: () => {},
  patchProp: () => {},
  insert: (el, parent) => { el.parent = parent; parent.children.push(el) },
  remove: (el) => { const p = el.parent; if (p) p.children = p.children.filter(c => c !== el) },
  parentNode: (el) => el.parent,
  nextSibling: () => null,
})

async function mountHome() {
  const { provideDashboard } = await import('./useDashboard')
  let ctx!: ReturnType<typeof provideDashboard>
  const Home = defineComponent({ setup() { ctx = provideDashboard({ cacheFirst: true }); return () => h('div') } })
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: Home as Component }] })
  const app = renderer.createApp({ render: () => h(Home) })
  app.use(router)
  const root: Node = { children: [], parent: null }
  app.mount(root)
  return Object.assign(() => app.unmount(), { get ctx() { return ctx } })
}

async function settle() {
  for (let i = 0; i < 50; i++) await Promise.resolve()
  await vi.advanceTimersByTimeAsync(0)
  for (let i = 0; i < 50; i++) await Promise.resolve()
}

describe('Home lifetime (useDashboard)', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('a Home unmounted before its init finishes leaves no timers or IPC listeners behind', async () => {
    const api = installApi()
    const unmount = await mountHome()
    unmount() // RouterView re-key ('guest' → 'user-N') or a quick click away, mid-init
    api.release()
    await settle()
    expect(api.listenerCount()).toBe(0)
    const before = api.count('app.getStatus')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(api.count('app.getStatus') - before).toBe(0) // no orphan 5 s status poll
  })

  it('startup remount: one live Home, not two — status polls and reloads per minute', async () => {
    const api = installApi()
    const first = await mountHome()
    first() // App re-keys the RouterView once its own startup calls return
    await mountHome()
    api.release()
    await settle()

    const status0 = api.count('app.getStatus')
    await vi.advanceTimersByTimeAsync(60_000)
    const statusPerMinute = api.count('app.getStatus') - status0
    expect(statusPerMinute).toBe(12) // one Home: 5 s poll (was 24 with the leaked instance)

    const rec0 = api.count('recordings.get')
    api.emit('recordings:updated')
    await settle()
    expect(api.count('recordings.get') - rec0).toBe(1) // was 2: the leaked Home reloaded too
    expect(api.listeners.get('dashboard:refresh')?.size ?? 0).toBe(1)
  })

  it('in a match with the game focused, Home runs no 5 s status poll and no 1 s clock re-render', async () => {
    const api = installApi()
    const home = await mountHome()
    api.release()
    await settle()
    api.emit('recording:status-changed', { recording: true, error: null })
    setFocus(false) // the game has focus; UpForge sits on the second monitor

    const status0 = api.count('app.getStatus')
    let clockTicks = 0
    const { watch } = await import('vue')
    const stop = watch(home.ctx.recordingElapsed, () => { clockTicks++ })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(api.count('app.getStatus') - status0).toBe(0) // was 12 per minute
    expect(clockTicks).toBe(0) // was 60 Home re-renders per minute

    setFocus(true) // alt-tab back: the clock is current straight away
    await settle()
    expect(home.ctx.recordingElapsed.value).toBe('01:00')
    stop()
  })
})
