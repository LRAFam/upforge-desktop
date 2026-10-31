import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RiotLocalApi } from './riot-local-api'
import type { SessionState } from './riot-types'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => process.cwd() } }))

function makeSession() {
  const api = new RiotLocalApi()
  let state: SessionState = {
    sessionLoopState: 'INGAME', queueId: null, matchMap: 'Range',
    allyScore: 0, enemyScore: 0, isReplay: false,
  }
  let core: boolean | null = false
  let pregame: boolean | null = false
  vi.spyOn(api, 'getSessionState').mockImplementation(async () => state)
  vi.spyOn(api, 'isCoreGameSessionActive').mockImplementation(async () => core)
  vi.spyOn(api, 'isPregameSessionActive').mockImplementation(async () => pregame)
  vi.spyOn(api, 'initAuth').mockResolvedValue(false)
  const ended = vi.fn()
  api.onMatchEnded = ended
  api.start('valorant')
  return {
    api, ended,
    setState: (next: Partial<SessionState>) => { state = { ...state, ...next } },
    setSessions: (nextCore: boolean | null, nextPregame: boolean | null = false) => {
      core = nextCore
      pregame = nextPregame
    },
    async tick(count = 1, shippingProcessRunning = true) {
      for (let i = 0; i < count; i++) {
        await vi.advanceTimersByTimeAsync(4_000)
        await api.pollActiveMatch({ state, shippingProcessRunning })
        await vi.advanceTimersByTimeAsync(0)
      }
    },
  }
}

describe('Riot match-end evidence', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-26T21:00:00Z'))
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('keeps a continuous Range session recording beyond three minutes when both routes always have no session', async () => {
    const match = makeSession()
    await match.tick(50)
    expect(match.ended).not.toHaveBeenCalled()
    expect(match.api.hasMatchEndSessionEvidence()).toBe(false)
  })

  it('still ends a Range session after confirmed MENUS', async () => {
    const match = makeSession()
    await match.tick(50)
    match.setState({ sessionLoopState: 'MENUS' })
    await match.tick(10)
    expect(match.ended).toHaveBeenCalledOnce()
  })

  it('still ends a Range session when the game process exits', async () => {
    const match = makeSession()
    await match.tick(50)
    await match.tick(10, false)
    expect(match.ended).toHaveBeenCalledOnce()
  })

  it('recovers stale INGAME after a previously live core session disappears', async () => {
    const match = makeSession()
    match.setSessions(true)
    await match.tick(25)
    expect(match.api.hasMatchEndSessionEvidence()).toBe(true)
    match.setSessions(false)
    await match.tick(14)
    expect(match.ended).not.toHaveBeenCalled()
    await match.tick()
    expect(match.ended).toHaveBeenCalledOnce()
  })

  it('does not carry positive core-session evidence into the next match', async () => {
    const match = makeSession()
    match.setSessions(true)
    await match.tick(25)
    match.setSessions(false)
    await match.tick(15)
    expect(match.ended).toHaveBeenCalledOnce()
    match.api.onMatchEnded = match.ended
    match.api.start('valorant')
    expect(match.api.hasMatchEndSessionEvidence()).toBe(false)
    await match.tick(50)
    expect(match.ended).toHaveBeenCalledOnce()
  })

  it('does not treat pregame alone as proof that a core match subsequently ended', async () => {
    const match = makeSession()
    match.setSessions(false, true)
    await match.tick(25)
    match.setSessions(false)
    await match.tick(50)
    expect(match.ended).not.toHaveBeenCalled()
  })

  it('does not expose a finished match as evidence while stopped or after restarting', async () => {
    const match = makeSession()
    match.setSessions(true)
    await match.tick(25)
    expect(match.api.hasMatchEndSessionEvidence()).toBe(true)
    await match.api.stop()
    expect(match.api.hasMatchEndSessionEvidence()).toBe(false)
    match.setSessions(false)
    match.api.start('valorant')
    expect(match.api.hasMatchEndSessionEvidence()).toBe(false)
    await match.tick(50)
    expect(match.ended).not.toHaveBeenCalled()
  })

  it('requires a fresh absence streak after an unavailable probe', async () => {
    const match = makeSession()
    match.setSessions(true)
    await match.tick(25)
    match.setSessions(false)
    await match.tick(14)
    match.setSessions(null)
    await match.tick()
    match.setSessions(false)
    await match.tick(14)
    expect(match.ended).not.toHaveBeenCalled()
    await match.tick()
    expect(match.ended).toHaveBeenCalledOnce()
  })

  it('preserves score-reset recovery when completed rounds prove a played match', async () => {
    const match = makeSession()
    match.setState({ allyScore: 2 })
    await match.tick(25)
    expect(match.api.hasMatchEndSessionEvidence()).toBe(true)
    match.setState({ allyScore: 0 })
    await match.tick(5)
    expect(match.ended).toHaveBeenCalledOnce()
  })
})
