import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LoLLiveClientApi,
  probeFromGameStats,
  type LolAllGameData,
  type LolLiveGameEvent,
} from './lol-live-client-api'

const LIVE: LolAllGameData = {
  allPlayers: [{
    summonerName: 'TestPlayer', championName: 'Ahri', team: 'ORDER',
    scores: { kills: 0, deaths: 0, assists: 0, creepScore: 0 },
  }],
  events: { Events: [] },
  gameData: { gameTime: 300, gameMode: 'CLASSIC', mapName: 'Map11' },
} as LolAllGameData

const GAME_END: LolAllGameData = {
  ...LIVE,
  events: { Events: [{ EventID: 9, EventName: 'GameEnd', EventTime: 900, Result: 'Win' } as LolLiveGameEvent] },
}

function makeApi() {
  const api = new LoLLiveClientApi()
  const all = vi.spyOn(api, 'fetchAllGameData').mockResolvedValue(LIVE)
  const stats = vi.spyOn(api, 'fetchGameStats').mockResolvedValue({ gameTime: 300, gameMode: 'CLASSIC', mapName: 'Map11' })
  return { api, all, stats }
}

describe('LoL Live Client single fetch', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

  it('60 s recorded match: poller (3 s) + background probe (2 s) make ≤22 requests (was 51)', async () => {
    const { api, all, stats } = makeApi()
    api.start(Date.now())
    for (let t = 0; t < 60_000; t += 2_000) {
      expect((await api.probeLiveness())?.inMatch ?? null).not.toBe(false)
      await vi.advanceTimersByTimeAsync(2_000)
    }
    const total = all.mock.calls.length + stats.mock.calls.length
    expect(total).toBeLessThanOrEqual(22)
    expect(stats.mock.calls.length).toBeLessThanOrEqual(1) // only before the first poll lands
    api.cancel()
  })

  it('probeActiveMatch reuses the poller snapshot while polling, including a failed poll', async () => {
    const { api, all } = makeApi()
    api.start(Date.now())
    await vi.advanceTimersByTimeAsync(1)
    expect(all).toHaveBeenCalledTimes(1)
    expect(await api.probeActiveMatch()).toMatchObject({ inMatch: true, gameTime: 300 })
    all.mockResolvedValue(null)
    await vi.advanceTimersByTimeAsync(3_000)
    expect(await api.probeActiveMatch()).toBeNull()
    expect(all).toHaveBeenCalledTimes(2)
    api.cancel()
  })

  it('not polling: probeLiveness uses gamestats, probeActiveMatch keeps the full GameEnd-aware fetch', async () => {
    const { api, all, stats } = makeApi()
    expect(await api.probeLiveness()).toMatchObject({ inMatch: true, gameTime: 300, mapName: 'Map11' })
    expect(stats).toHaveBeenCalledTimes(1)
    expect(all).not.toHaveBeenCalled()
    all.mockResolvedValue(GAME_END)
    expect((await api.probeActiveMatch())?.inMatch).toBe(false)
    expect(all).toHaveBeenCalledTimes(1)
    stats.mockResolvedValue(null)
    expect(await api.probeLiveness()).toBeNull()
  })

  it('gamestats liveness: loading screen (clock 0) is not in match', () => {
    expect(probeFromGameStats({ gameTime: 0 }).inMatch).toBe(false)
    expect(probeFromGameStats({}).inMatch).toBe(false)
    expect(probeFromGameStats({ gameTime: 12.5, gameMode: 'ARAM' }).inMatch).toBe(true)
  })

  it('end detection unchanged: GameEnd fires once', async () => {
    const { api, all } = makeApi()
    all.mockResolvedValueOnce(LIVE).mockResolvedValue(GAME_END)
    api.start(1000)
    const ended = vi.fn(); api.onMatchEnded = ended
    await vi.advanceTimersByTimeAsync(10_000)
    expect(ended).toHaveBeenCalledOnce()
    api.cancel()
  })

  it('end detection unchanged: exactly 3 missed polls after the match was seen live', async () => {
    const { api, all } = makeApi()
    let calls = 0
    all.mockImplementation(async () => (++calls === 1 ? LIVE : null))
    api.start(1000)
    const ended = vi.fn(); api.onMatchEnded = ended
    await vi.advanceTimersByTimeAsync(1)
    // Background probes in between must not count as polls.
    while (calls < 3) { await api.probeLiveness(); await vi.advanceTimersByTimeAsync(100) }
    expect(ended).not.toHaveBeenCalled()
    while (calls < 4) await vi.advanceTimersByTimeAsync(100)
    expect(ended).toHaveBeenCalledOnce()
    api.cancel()
  })

  it('never ends a match that was not seen live (loading screen)', async () => {
    const { api, all } = makeApi()
    all.mockResolvedValue(null)
    api.start(1000)
    const ended = vi.fn(); api.onMatchEnded = ended
    await vi.advanceTimersByTimeAsync(30_000)
    expect(ended).not.toHaveBeenCalled()
    api.cancel()
  })
})
