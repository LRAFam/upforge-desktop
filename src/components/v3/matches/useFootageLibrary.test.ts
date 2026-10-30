import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

const mounted: Array<() => unknown> = []
const unmounted: Array<() => unknown> = []
vi.mock('vue', async (orig) => ({
  ...(await orig<typeof import('vue')>()),
  onMounted: (fn: () => unknown) => { mounted.push(fn) },
  onUnmounted: (fn: () => unknown) => { unmounted.push(fn) },
}))
const route = { query: {} as Record<string, unknown> }
const router = { push: vi.fn() }
vi.mock('vue-router', () => ({ useRoute: () => route, useRouter: () => router }))

const { useFootageLibrary } = await import('./useFootageLibrary')

type Rec = Record<string, unknown>
const rec = (over: Rec): Rec => ({ id: 'r', path: '', game: 'valorant', map: 'Bind', gameMode: '', recordedAt: Date.now(), analysed: false, ...over })

let listeners: Record<string, Array<() => void>>
let dismiss: ReturnType<typeof vi.fn>
let confirmAnswer: boolean
let confirmCalls: string[]

function install(local: Rec[]) {
  listeners = {}
  dismiss = vi.fn(async () => ({ ok: true, freedBytes: 0 }))
  confirmCalls = []
  ;(globalThis as unknown as { window: unknown }).window = {
    confirm: (m: string) => { confirmCalls.push(m); return confirmAnswer },
    api: {
      on: (event: string, cb: () => void) => { (listeners[event] ??= []).push(cb); return () => {} },
      recordings: { listAll: vi.fn(async () => local), dismiss },
      cloudStorage: { list: vi.fn(async () => ({ ok: true, data: { items: [], page: 1, last_page: 1 } })) },
      storage: { getUsage: vi.fn(async () => ({ recordingsBytes: 0 })), openFolder: vi.fn() },
      app: { getStatus: vi.fn(async () => ({ obsConnected: true })) },
    },
  }
}

async function start(local: Rec[], options?: Parameters<typeof useFootageLibrary>[0]) {
  install(local)
  mounted.length = 0
  const lib = useFootageLibrary(options)
  await Promise.all(mounted.map(fn => fn()))
  await vi.waitFor(() => expect(lib.loading.value).toBe(false))
  await nextTick()
  return lib
}

beforeEach(() => { route.query = {}; confirmAnswer = true; router.push.mockClear() })

describe('useFootageLibrary', () => {
  it('filters by game and lists the games present', async () => {
    const lib = await start([rec({ id: 'a', game: 'valorant' }), rec({ id: 'b', game: 'lol' })])
    expect(lib.gamesPresent.value.sort()).toEqual(['lol', 'valorant'])
    lib.gameFilter.value = 'lol'
    expect(lib.filtered.value.map(r => r.id)).toEqual(['b'])
  })

  it('the cloud chip keeps only footage with a cloud copy', async () => {
    const lib = await start([rec({ id: 'local' }), rec({ id: 'cloud', archiveId: 'arc-1', cloudUploaded: true })])
    lib.statusChip.value = 'cloud'
    expect(lib.chipFiltered.value.map(r => r.id)).toEqual(['cloud'])
  })

  it('reads the status chip from the route and ignores unknown values', async () => {
    route.query = { status: 'analysed' }
    expect((await start([])).statusChip.value).toBe('analysed')
    route.query = { status: 'nonsense' }
    expect((await start([])).statusChip.value).toBe('all')
  })

  it('clears footage on sign-out, even before the screen mounts', () => {
    install([])
    const lib = useFootageLibrary()
    expect(listeners['session:user-changed']).toHaveLength(1)
    listeners['session:user-changed'][0]()
    expect(lib.cloudError.value).toBe('Sign in to load cloud footage.')
  })

  it('asks before deleting footage that is still uploading, and stops if the player says no', async () => {
    const lib = await start([rec({ id: 'busy', pipelineStatus: 'uploading', path: '/x.mp4' })])
    confirmAnswer = false
    await lib.deleteRecording(lib.recordings.value[0])
    expect(confirmCalls[0]).toMatch(/still uploading or analysing/)
    expect(dismiss).not.toHaveBeenCalled()
  })

  it('cloud-backed local footage opens the keep-cloud choice instead of deleting straight away', async () => {
    const lib = await start([rec({ id: 'backed', path: '/x.mp4', hasLocalFile: true, jobId: 'job-1' })])
    await lib.deleteRecording(lib.recordings.value[0])
    expect(lib.pendingDelete.value?.rec.id).toBe('backed')
    expect(dismiss).not.toHaveBeenCalled()
  })

  it('local-only footage is removed after a confirm', async () => {
    const lib = await start([rec({ id: 'plain', path: '/x.mp4', hasLocalFile: true })])
    await lib.deleteRecording(lib.recordings.value[0])
    expect(confirmCalls[0]).toMatch(/remove the local file/)
    expect(dismiss).toHaveBeenCalledWith('plain', { mode: 'remove', deleteLocal: true })
  })

  it('bulk delete does nothing without a selection', async () => {
    const lib = await start([rec({ id: 'a' })])
    await lib.deleteSelected()
    expect(confirmCalls).toHaveLength(0)
    expect(dismiss).not.toHaveBeenCalled()
  })

  it('uses an injected confirm (v3 dialog) instead of the native one, for single and bulk delete', async () => {
    const asked: string[] = []
    const lib = await start([rec({ id: 'a', path: '/a.mp4', hasLocalFile: true }), rec({ id: 'b', path: '/b.mp4', hasLocalFile: true })], {
      confirm: async (m) => { asked.push(m); return m.includes('2 recording') },
    })
    await lib.deleteRecording(lib.recordings.value[0])
    expect(dismiss).not.toHaveBeenCalled()
    lib.toggleSelectMode()
    lib.toggleSelected('a'); lib.toggleSelected('b')
    await lib.deleteSelected()
    expect(asked).toHaveLength(2)
    expect(confirmCalls).toHaveLength(0)
    expect(dismiss).toHaveBeenCalledTimes(2)
  })
})
