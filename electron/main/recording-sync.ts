import type { MatchData } from './riot-types'

/**
 * Map in-game time (ms from match/demo start) to offset in the local recording file.
 * Simplified vs Valorant's loading-screen skew — suitable for GSI + demo tick alignment.
 */
export function gameTimeToVideoOffsetMs(
  gameTimeMs: number,
  timing: Pick<MatchData, 'matchStartTime' | 'recordingStartTime'>,
): number {
  const { matchStartTime, recordingStartTime } = timing
  if (matchStartTime == null || recordingStartTime == null) {
    return Math.max(0, gameTimeMs)
  }
  const recordingLagMs = Math.max(0, recordingStartTime - matchStartTime)
  return Math.max(0, gameTimeMs - recordingLagMs)
}

export function emptyMatchData(game: string, recordingStartTime: number): MatchData {
  return {
    game,
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
    recordingStartTime,
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
    startTime: recordingStartTime,
    endTime: null,
  }
}
