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

/**
 * Map a LoL Live Client game-clock time to a position in the recording.
 *
 * LoL `EventTime` is measured from Riot's in-game clock zero (when the match
 * simulation starts), NOT from when OBS started nor from when the map finished
 * loading. Loading duration varies per lobby (every player must connect and
 * ready up), so we anchor to the observed `gameClockZeroEpoch` and convert to a
 * video offset via wall-clock time:
 *   eventEpoch    = gameClockZeroEpoch + gameTimeMs
 *   videoOffsetMs = eventEpoch - recordingStartTime (+ manual sync nudge)
 */
export function lolGameTimeToVideoOffsetMs(
  gameTimeMs: number,
  opts: {
    gameClockZeroEpoch: number | null | undefined
    recordingStartTime: number | null | undefined
    syncOffset?: number
  },
): number {
  const sync = opts.syncOffset ?? 0
  if (opts.gameClockZeroEpoch == null || opts.recordingStartTime == null) {
    return Math.max(0, gameTimeMs + sync)
  }
  const eventEpoch = opts.gameClockZeroEpoch + gameTimeMs
  return Math.max(0, eventEpoch - opts.recordingStartTime + sync)
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
  const game = timeline.game ?? 'valorant'
  // LoL uses the live-client event feed — every ChampionKill lands in killEvents;
  // the player's own kills are tagged "You" so the viewer can classify them.
  if (game === 'lol') return timeline.killEvents ?? timeline.playerKills ?? []
  if (timeline.playerKills?.length) return timeline.playerKills
  if (game === 'cs2' || game === 'deadlock') {
    return timeline.killEvents ?? []
  }
  return []
}

/** Deaths for the VOD round log — player deaths only; demo fallback uses killEvents tagged "You". */
export function timelineDeathsForVod(timeline: VodKillSource | null | undefined): KillEvent[] {
  if (!timeline) return []
  const game = timeline.game ?? 'valorant'
  if (game === 'lol') {
    return timeline.playerDeaths?.length
      ? timeline.playerDeaths
      : (timeline.killEvents ?? []).filter((k) => k.victimName === 'You')
  }
  if (timeline.playerDeaths?.length) return timeline.playerDeaths
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
