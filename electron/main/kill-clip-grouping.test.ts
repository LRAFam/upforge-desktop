import { describe, expect, it } from 'vitest'
import { assignKillSpreeRounds, buildClipKills, ensureClipKillRounds } from './kill-clip-grouping'
import type { KillEvent, MatchData } from './riot-types'

function killAt(ms: number, killer = 'You'): KillEvent {
  return {
    EventID: 0,
    EventName: 'ChampionKill',
    EventTime: ms / 1000,
    killerName: killer,
    victimName: 'Enemy',
    assistants: [],
    timeSinceGameStartMillis: ms,
  }
}

function matchData(overrides: Partial<MatchData> = {}): MatchData {
  return {
    game: 'lol',
    matchId: null,
    puuid: null,
    region: null,
    queueId: null,
    map: null,
    agent: null,
    gameMode: null,
    playerName: null,
    playerTag: null,
    matchStartTime: null,
    gameplayStartTime: null,
    recordingStartTime: 0,
    roundScores: [],
    events: [],
    killEvents: [],
    playerKills: [],
    playerDeaths: [],
    spikePlants: [],
    spikeDefuses: [],
    spikeDetonations: [],
    firstBloods: [],
    roundSummaries: [],
    finalStats: null,
    teamSnapshot: [],
    matchDetails: null,
    startTime: 0,
    endTime: null,
    ...overrides,
  }
}

function lolTimeline(killEvents: KillEvent[]): MatchData {
  return matchData({
    game: 'lol',
    killEvents,
    playerKills: killEvents.filter((k) => k.killerName === 'You'),
    playerDeaths: [],
  })
}

describe('assignKillSpreeRounds', () => {
  it('groups player kills into time-proximity sprees', () => {
    const kills = [killAt(60_000), killAt(63_000), killAt(65_000), killAt(300_000)]
    assignKillSpreeRounds(kills)
    expect(kills[0]?.round).toBe(0)
    expect(kills[1]?.round).toBe(0)
    expect(kills[2]?.round).toBe(0)
    expect(kills[3]?.round).toBe(1)
  })
})

describe('ensureClipKillRounds', () => {
  it('assigns spree rounds for LoL timelines with ungrouped kills', () => {
    const timeline = lolTimeline([killAt(10_000), killAt(12_000), killAt(14_000)])
    ensureClipKillRounds(timeline)
    expect(timeline.killEvents![0]?.round).toBe(0)
    expect(timeline.killEvents![2]?.round).toBe(0)
  })

  it('skips round-based games', () => {
    const timeline = matchData({
      game: 'valorant',
      killEvents: [killAt(10_000)],
    })
    ensureClipKillRounds(timeline)
    expect(timeline.killEvents![0]?.round).toBeUndefined()
  })

  it('re-groups when all player kills share round -1', () => {
    const k1 = killAt(10_000)
    const k2 = killAt(12_000)
    const k3 = killAt(200_000)
    k1.round = -1
    k2.round = -1
    k3.round = -1
    const timeline = lolTimeline([k1, k2, k3])
    ensureClipKillRounds(timeline)
    expect(k1.round).toBe(0)
    expect(k2.round).toBe(0)
    expect(k3.round).toBe(1)
  })
})

describe('buildClipKills', () => {
  it('returns spree-grouped COPIES without mutating the stored LoL timeline', () => {
    const k1 = killAt(60_000)
    const k2 = killAt(63_000)
    const k3 = killAt(300_000)
    const timeline = lolTimeline([k1, k2, k3])

    const clipKills = buildClipKills(timeline)

    // Copies carry spree rounds for grouping…
    expect(clipKills[0]?.round).toBe(0)
    expect(clipKills[1]?.round).toBe(0)
    expect(clipKills[2]?.round).toBe(1)
    // …but the stored timeline stays round-free (continuous match view).
    expect(k1.round).toBeUndefined()
    expect(k2.round).toBeUndefined()
    expect(k3.round).toBeUndefined()
  })

  it('returns round-based kills untouched for Valorant', () => {
    const k = killAt(10_000)
    k.round = 4
    const timeline = matchData({ game: 'valorant', playerKills: [k] })
    const clipKills = buildClipKills(timeline)
    expect(clipKills[0]).toBe(k)
    expect(clipKills[0]?.round).toBe(4)
  })

  it('returns [] when there are no player kills', () => {
    expect(buildClipKills(matchData({ game: 'lol', playerKills: [] }))).toEqual([])
    expect(buildClipKills(null)).toEqual([])
  })
})
