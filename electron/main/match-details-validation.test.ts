import { describe, expect, it } from 'vitest'
import {
  shouldApplyMatchDetails,
  shouldApplyRecoveredMatchDetails,
} from './match-details-validation'
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

function details(gameLengthMillis: number, gameStartMillis?: number): Record<string, unknown> {
  return {
    matchInfo: {
      mapId: '/Game/Maps/Foxtrot/Foxtrot',
      queueID: 'competitive',
      gameLengthMillis,
      ...(gameStartMillis == null ? {} : { gameStartMillis }),
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

describe('shouldApplyRecoveredMatchDetails', () => {
  const recordingStartTime = 1_700_000_000_000
  const recordingEndTime = recordingStartTime + 30 * 60_000

  it('accepts Riot details whose canonical timing aligns with the VOD', () => {
    const result = shouldApplyRecoveredMatchDetails(
      timeline({
        map: null,
        gameMode: null,
        matchStartTime: null,
        gameplayStartTime: null,
        recordingStartTime,
        startTime: recordingStartTime,
        endTime: recordingEndTime,
      }),
      details(25 * 60_000, recordingStartTime + 2 * 60_000),
    )

    expect(result).toEqual({ apply: true, reason: 'aligned' })
  })

  it('rejects a recent Riot match from a different time', () => {
    const result = shouldApplyRecoveredMatchDetails(
      timeline({
        map: null,
        gameMode: null,
        matchStartTime: null,
        gameplayStartTime: null,
        recordingStartTime,
        startTime: recordingStartTime,
        endTime: recordingEndTime,
      }),
      details(25 * 60_000, recordingStartTime - 40 * 60_000),
    )

    expect(result).toEqual({ apply: false, reason: 'match start does not align with recording' })
  })

  it('rejects details without canonical Riot start timing', () => {
    const result = shouldApplyRecoveredMatchDetails(
      timeline({
        map: null,
        gameMode: null,
        matchStartTime: null,
        gameplayStartTime: null,
        recordingStartTime,
        startTime: recordingStartTime,
        endTime: recordingEndTime,
      }),
      details(25 * 60_000),
    )

    expect(result).toEqual({ apply: false, reason: 'Riot matchInfo.gameStartMillis missing' })
  })
})
