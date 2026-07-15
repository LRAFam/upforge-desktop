import { describe, expect, it } from 'vitest'
import { shouldApplyMatchDetails } from './match-details-validation'
import type { MatchData } from './riot-types'

function timeline(overrides: Partial<MatchData> = {}): MatchData {
  return {
    game: 'valorant',
    matchId: 'match-1',
    puuid: 'player-1',
    region: 'eu',
    queueId: 'competitive',
    map: 'Breeze',
    agent: null,
    gameMode: 'COMPETITIVE',
    playerName: 'Player',
    playerTag: 'EU1',
    matchStartTime: 0,
    gameplayStartTime: 60_000,
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
    endTime: 20 * 60_000,
    videoSyncOffsetMs: -8000,
    ...overrides,
  }
}

function details(gameLengthMillis: number): Record<string, unknown> {
  return {
    matchInfo: {
      mapId: '/Game/Maps/Foxtrot/Foxtrot',
      queueID: 'competitive',
      gameLengthMillis,
    },
  }
}

describe('shouldApplyMatchDetails', () => {
  it('accepts same map/mode when recording includes long load-in time', () => {
    const result = shouldApplyMatchDetails(
      timeline({
        matchStartTime: 0,
        recordingStartTime: 0,
        gameplayStartTime: 0,
        endTime: 30 * 60_000,
      }),
      details(18 * 60_000),
    )

    expect(result).toEqual({ apply: true, reason: 'aligned' })
  })

  it('still rejects a clearly wrong latest-history match', () => {
    const result = shouldApplyMatchDetails(
      timeline({
        matchStartTime: 0,
        recordingStartTime: 0,
        gameplayStartTime: 60_000,
        endTime: 30 * 60_000,
      }),
      details(8 * 60_000),
    )

    expect(result.apply).toBe(false)
    expect(result.reason).toContain('duration mismatch')
  })
})
