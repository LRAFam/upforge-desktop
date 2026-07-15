import { describe, expect, it } from 'vitest'
import { hasRichMatchData, timelineNeedsEnrichRefresh } from './match-data-quality'
import type { MatchData } from './riot-types'

function sparseTimeline(): MatchData {
  return {
    game: 'valorant',
    matchId: 'd12f127d-faab-4e01-8d2c-338b02a82f06',
    puuid: 'x',
    region: 'br',
    queueId: 'competitive',
    map: 'Haven',
    agent: null,
    gameMode: 'COMPETITIVE',
    playerName: 'at19',
    playerTag: '2729',
    matchStartTime: 1,
    gameplayStartTime: 2,
    recordingStartTime: 3,
    roundScores: [{ allyScore: 11, enemyScore: 13, detectedAt: 4 }],
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
    startTime: 1,
    endTime: 2,
    videoSyncOffsetMs: -8000,
  }
}

function roundSummary(overrides: Partial<MatchData['roundSummaries'][number]> = {}): MatchData['roundSummaries'][number] {
  return {
    roundNumber: 0,
    winningTeam: 'Blue',
    ceremony: null,
    endTime: 0,
    playerStats: null,
    spikePlanted: false,
    spikeSite: null,
    spikePlanter: null,
    spikeDefused: false,
    spikeDefuser: null,
    spikeDetonated: false,
    playerGold: null,
    playerAbilities: null,
    playerGotFirstBlood: false,
    playerWasFirstBlood: false,
    playerSpent: null,
    playerLoadoutValue: null,
    playerWeapon: null,
    playerArmor: null,
    playerDamageDealt: null,
    ...overrides,
  }
}

describe('hasRichMatchData', () => {
  it('returns false for skeleton timeline (analysis #380 case)', () => {
    expect(hasRichMatchData(sparseTimeline())).toBe(false)
  })

  it('returns true when finalStats has kills', () => {
    const tl = sparseTimeline()
    tl.finalStats = {
      kills: 14,
      deaths: 10,
      assists: 3,
      score: 220,
      summonerName: 'at19',
      agent: 'Chamber',
      team: 'Blue',
      level: 100,
      headshotPct: 30,
      adr: 140,
      accountLevel: 200,
    }
    expect(hasRichMatchData(tl)).toBe(true)
  })

  it('returns false when finalStats are all zero', () => {
    const tl = sparseTimeline()
    tl.finalStats = {
      kills: 0,
      deaths: 0,
      assists: 0,
      score: 0,
      summonerName: 'at19',
      agent: 'Chamber',
      team: 'Blue',
      level: 100,
      headshotPct: 0,
      adr: 0,
      accountLevel: 200,
    }
    expect(hasRichMatchData(tl)).toBe(false)
  })

  it('returns false when only roundSummaries exist (no kills)', () => {
    const tl = sparseTimeline()
    tl.roundSummaries = [roundSummary({ roundNumber: 1 })]
    expect(hasRichMatchData(tl)).toBe(false)
  })
})

describe('timelineNeedsEnrichRefresh', () => {
  it('needs refresh when there are no kills or rounds', () => {
    expect(timelineNeedsEnrichRefresh(sparseTimeline())).toBe(true)
  })

  it('does not need refresh once kill events exist', () => {
    const tl = sparseTimeline()
    tl.killEvents = [{ EventID: 1, EventName: 'ChampionKill', EventTime: 1 } as MatchData['killEvents'][number]]
    expect(timelineNeedsEnrichRefresh(tl)).toBe(false)
  })

  it('does not block on missing plant coords or spatial plants when kills exist', () => {
    const tl = sparseTimeline()
    tl.killEvents = [{ EventID: 1, EventName: 'ChampionKill', EventTime: 1 } as MatchData['killEvents'][number]]
    tl.roundSummaries = [roundSummary({
      roundNumber: 1,
      spikePlanted: true,
      spikeSite: 'A',
      spikePlanter: 'You',
    })]
    tl.spikePlants = [{
      EventID: 110,
      EventName: 'SpikePlanted',
      EventTime: 1,
      planter: 'You',
      site: 'A',
      plantLocation: null,
      round: 1,
    } as unknown as MatchData['spikePlants'][number]]
    expect(timelineNeedsEnrichRefresh(tl)).toBe(false)
  })

  it('does not need refresh when only round summaries exist', () => {
    const tl = sparseTimeline()
    tl.roundSummaries = [roundSummary()]
    expect(timelineNeedsEnrichRefresh(tl)).toBe(false)
  })
})
