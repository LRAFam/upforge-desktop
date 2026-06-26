import { describe, expect, it } from 'vitest'
import { hasRichMatchData } from './match-data-quality'
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
})
