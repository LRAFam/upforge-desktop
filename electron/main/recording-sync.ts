import type { KillEvent, MatchData } from './riot-types'

/**
 * Map in-game time (ms from match/demo start) to offset in the local recording file.
 * For CS2, pass gameTimeMs already aligned to round_start (see cs2-demo-parser demo anchor).
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

/** CS2 demo ticks before first gun round — subtract so game clock matches the VOD. */
export function cs2AlignedGameTimeMs(
  tick: number,
  anchorTick: number,
  tickRate: number,
): number {
  return Math.max(0, tickToMsFromTick(tick - anchorTick, tickRate))
}

export function tickToMsFromTick(tick: number, tickRate: number): number {
  return Math.round((tick / tickRate) * 1000)
}

/** Normalize matchStartTime to epoch ms (handles legacy seconds values). */
export function resolveMatchSessionStartMs(
  timeline: Pick<MatchData, 'matchStartTime'> | null | undefined,
  recordedAt: number,
): number {
  const raw = timeline?.matchStartTime
  if (raw != null) {
    return raw > 1e12 ? raw : raw * 1000
  }
  return recordedAt - 45 * 60 * 1000
}

type VodKillSource = Pick<MatchData, 'game' | 'playerKills' | 'playerDeaths' | 'killEvents'>

/** Kills for the VOD round log — falls back to all demo kills when local player wasn't matched. */
export function timelineKillsForVod(timeline: VodKillSource | null | undefined): KillEvent[] {
  if (!timeline) return []
  if (timeline.playerKills?.length) return timeline.playerKills
  const game = timeline.game ?? 'valorant'
  if (game === 'cs2' || game === 'deadlock') {
    return timeline.killEvents ?? []
  }
  return []
}

/** Deaths for the VOD round log — player deaths only; demo fallback uses killEvents tagged "You". */
export function timelineDeathsForVod(timeline: VodKillSource | null | undefined): KillEvent[] {
  if (!timeline) return []
  if (timeline.playerDeaths?.length) return timeline.playerDeaths
  const game = timeline.game ?? 'valorant'
  if (game === 'cs2' || game === 'deadlock') {
    return (timeline.killEvents ?? []).filter((k) => k.victimName === 'You')
  }
  return []
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
