import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RiotLocalApi } from './riot-local-api'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => process.cwd() } }))

const PUUID = 'own-puuid'

function presences(loop: string) {
  const priv = Buffer.from(JSON.stringify({ matchPresenceData: { sessionLoopState: loop } })).toString('base64')
  return { presences: [{ puuid: PUUID, product: 'valorant', private: priv }] }
}

function makeApi() {
  const api = new RiotLocalApi()
  const internals = api as unknown as Record<string, unknown>
  internals.lockfileData = { port: 1, password: 'x', protocol: 'https' }
  internals.ownPuuid = PUUID
  let loop = 'INGAME'
  const fetchLocal = vi.fn(async (path: string) => {
    if (path !== '/chat/v4/presences') throw new Error(`unexpected ${path}`)
    await new Promise((r) => setTimeout(r, 50))
    return presences(loop)
  })
  internals._fetchLocal = fetchLocal
  return { api, fetchLocal, setLoop: (next: string) => { loop = next } }
}

describe('RiotLocalApi.getSharedSessionState', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('serves N concurrent loop callers within the TTL with one presences request', async () => {
    const { api, fetchLocal } = makeApi()
    const pending = Array.from({ length: 6 }, () => api.getSharedSessionState())
    await vi.advanceTimersByTimeAsync(50)
    const states = await Promise.all(pending)
    expect(states.every((s) => s?.sessionLoopState === 'INGAME')).toBe(true)
    // Session loop (1 s) + background probe (2 s) inside the TTL window.
    await vi.advanceTimersByTimeAsync(1_000)
    await api.getSharedSessionState()
    expect(fetchLocal).toHaveBeenCalledTimes(1)
  })

  it('refreshes once the TTL has passed', async () => {
    const { api, fetchLocal, setLoop } = makeApi()
    const first = api.getSharedSessionState()
    await vi.advanceTimersByTimeAsync(50)
    expect((await first)?.sessionLoopState).toBe('INGAME')
    setLoop('MENUS')
    await vi.advanceTimersByTimeAsync(RiotLocalApi.SHARED_SESSION_STATE_TTL_MS)
    const second = api.getSharedSessionState()
    await vi.advanceTimersByTimeAsync(50)
    expect((await second)?.sessionLoopState).toBe('MENUS')
    expect(fetchLocal).toHaveBeenCalledTimes(2)
  })

  it('fresh reads and getSessionState() bypass the shared cache', async () => {
    const { api, fetchLocal, setLoop } = makeApi()
    const first = api.getSharedSessionState()
    await vi.advanceTimersByTimeAsync(50)
    await first
    setLoop('MENUS')
    const direct = api.getSessionState()
    await vi.advanceTimersByTimeAsync(50)
    expect((await direct)?.sessionLoopState).toBe('MENUS')
    const fresh = api.getSharedSessionState({ fresh: true })
    await vi.advanceTimersByTimeAsync(50)
    expect((await fresh)?.sessionLoopState).toBe('MENUS')
    expect(fetchLocal).toHaveBeenCalledTimes(3)
  })

  it('over a simulated 60 s match the two loops issue ~30 presences requests, not ~90', async () => {
    const { api, fetchLocal } = makeApi()
    // Session loop every 1 s (overlay on) + background probe every 2 s.
    for (let ms = 0; ms < 60_000; ms += 1_000) {
      void api.getSharedSessionState()
      if (ms % 2_000 === 0) void api.getSharedSessionState()
      await vi.advanceTimersByTimeAsync(1_000)
    }
    expect(fetchLocal.mock.calls.length).toBeLessThanOrEqual(31)
  })
})
