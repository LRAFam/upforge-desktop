import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({
  runs: [] as Array<{ deps: Record<string, (...args: unknown[]) => unknown>; input: unknown; resolve: (v: unknown) => void; reject: (e: unknown) => void }>,
}))
vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }))
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: true } }))
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }))
vi.mock('../coach-flow-demo', () => ({ cutWithFfmpeg: vi.fn(() => vi.fn()) }))
vi.mock('../coach-flow-live', () => ({
  runLiveCoachFlow: vi.fn((deps: Record<string, (...args: unknown[]) => unknown>, input: unknown) =>
    new Promise((resolve, reject) => { state.runs.push({ deps, input, resolve, reject }) })),
}))
import { setupCoachFlowLiveHandlers, startLiveCoachFlow } from './coach-flow-live-ipc'
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { AuthManager } from '../auth-manager'

const flush = () => new Promise(r => setTimeout(r, 0))

function makeAuth(opts: { authed?: boolean; get?: ReturnType<typeof vi.fn> } = {}) {
  const get = opts.get ?? vi.fn(async () => ({ status: 200, data: { success: true } }))
  const post = vi.fn(async () => ({ status: 200, data: {} }))
  const auth = { isAuthenticated: () => opts.authed ?? true, getApi: () => ({ get, post }) }
  return { auth: auth as unknown as AuthManager, get, post }
}

function handlersFor(auth: AuthManager, trusted = true) {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  setupCoachFlowLiveHandlers(
    { handle: (name: string, fn: (...args: unknown[]) => unknown) => handlers.set(name, fn) } as unknown as IpcMain,
    auth,
    () => trusted,
  )
  const event = {} as IpcMainInvokeEvent
  return {
    allowances: () => handlers.get('coach:allowances')!(event),
    moments: (id: unknown) => handlers.get('coach-flow:moments')!(event, id),
  }
}

describe('setupCoachFlowLiveHandlers', () => {
  const VALID = 'match_ABC-123'

  it('returns null for untrusted events without calling the API', async () => {
    const { auth, get } = makeAuth()
    const h = handlersFor(auth, false)
    expect(await h.allowances()).toBeNull()
    expect(await h.moments(VALID)).toBeNull()
    expect(get).not.toHaveBeenCalled()
  })

  it('returns null when signed out', async () => {
    const { auth, get } = makeAuth({ authed: false })
    const h = handlersFor(auth)
    expect(await h.allowances()).toBeNull()
    expect(await h.moments(VALID)).toBeNull()
    expect(get).not.toHaveBeenCalled()
  })

  it.each([['short'], ['abc/def123'], ['abc..def123'], ['../../etc'], [123456789], [null], [undefined], [{ id: VALID }], ['a'.repeat(81)]])(
    'moments returns null for invalid match id %j',
    async (id) => {
      const { auth, get } = makeAuth()
      expect(await handlersFor(auth).moments(id)).toBeNull()
      expect(get).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['non-200', { status: 500, data: { success: true } }],
    ['404', { status: 404, data: { success: true, moments: [] } }],
    ['success:false', { status: 200, data: { success: false } }],
    ['missing body', { status: 200, data: undefined }],
  ])('returns null on %s responses', async (_label, response) => {
    const { auth } = makeAuth({ get: vi.fn(async () => response) })
    const h = handlersFor(auth)
    expect(await h.allowances()).toBeNull()
    expect(await h.moments(VALID)).toBeNull()
  })

  it('returns null when the request rejects', async () => {
    const { auth } = makeAuth({ get: vi.fn(async () => { throw new Error('network') }) })
    const h = handlersFor(auth)
    expect(await h.allowances()).toBeNull()
    expect(await h.moments(VALID)).toBeNull()
  })

  it('allowances returns the response data when valid', async () => {
    const data = { success: true, clips: { used: 1, limit: 3 } }
    const { auth, get } = makeAuth({ get: vi.fn(async () => ({ status: 200, data })) })
    expect(await handlersFor(auth).allowances()).toEqual(data)
    expect(get).toHaveBeenCalledWith('/api/coach/allowances', expect.anything())
  })

  it('moments returns moments and allowance when valid', async () => {
    const data = { success: true, moments: [{ id: 1 }], allowance: { left: 2 }, extra: 'ignored' }
    const { auth, get } = makeAuth({ get: vi.fn(async () => ({ status: 200, data })) })
    expect(await handlersFor(auth).moments(VALID)).toEqual({ moments: [{ id: 1 }], allowance: { left: 2 } })
    expect(get).toHaveBeenCalledWith(`/api/coach-flow/${VALID}/moments`, expect.anything())
  })

  it('moments defaults missing moments and allowance', async () => {
    const { auth } = makeAuth({ get: vi.fn(async () => ({ status: 200, data: { success: true } })) })
    expect(await handlersFor(auth).moments(VALID)).toEqual({ moments: [], allowance: null })
  })
})

describe('startLiveCoachFlow', () => {
  let n = 0
  const nextId = () => `match_${++n}_abcdef`
  beforeEach(() => { state.runs.length = 0 })

  function start(over: Partial<Parameters<typeof startLiveCoachFlow>[0]> = {}) {
    const { auth } = makeAuth()
    const send = vi.fn()
    startLiveCoachFlow({ auth, matchId: nextId(), videoPath: '/videos/m.mp4', matchData: { map: 'Ascent' }, send, ...over })
    return send
  }

  it('does nothing when matchId, videoPath or matchData is missing, or the match id is invalid', () => {
    start({ matchId: null })
    start({ matchId: undefined })
    start({ matchId: '' })
    start({ matchId: '../etc' })
    start({ videoPath: null })
    start({ videoPath: '' })
    start({ matchData: undefined })
    expect(state.runs).toHaveLength(0)
  })

  it('does nothing when signed out', () => {
    start({ auth: makeAuth({ authed: false }).auth })
    expect(state.runs).toHaveLength(0)
  })

  it('starts a run with the match input', () => {
    const matchId = nextId()
    start({ matchId })
    expect(state.runs).toHaveLength(1)
    expect(state.runs[0].input).toEqual({ matchId, videoPath: '/videos/m.mp4', matchData: { map: 'Ascent' } })
  })

  it('starts only one run per matchId while a run is in flight', async () => {
    const matchId = nextId()
    start({ matchId })
    start({ matchId })
    await flush()
    start({ matchId })
    expect(state.runs).toHaveLength(1)
    start({ matchId: nextId() })
    expect(state.runs).toHaveLength(2)
  })

  it('allows a new run after the previous one resolves', async () => {
    const matchId = nextId()
    start({ matchId })
    state.runs[0].resolve({ state: 'done', found: 2 })
    await flush()
    start({ matchId })
    expect(state.runs).toHaveLength(2)
  })

  it('allows a new run after the previous one rejects', async () => {
    const matchId = nextId()
    start({ matchId })
    state.runs[0].reject(new Error('boom'))
    await flush()
    start({ matchId })
    expect(state.runs).toHaveLength(2)
  })

  it('forwards updates to send and survives a send that throws', async () => {
    const matchId = nextId()
    const send = vi.fn(() => { throw new Error('window closed') })
    start({ matchId, send })
    const update = { state: 'running', found: 0 }
    expect(() => state.runs[0].deps.emit(update)).not.toThrow()
    expect(send).toHaveBeenCalledWith(update)
    state.runs[0].resolve({ state: 'done', found: 1 })
    await flush()
    start({ matchId })
    expect(state.runs).toHaveLength(2)
  })
})
