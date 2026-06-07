/**
 * Guard against attaching Riot MatchDetails from the wrong game to a recording.
 * Custom/practice lobbies often lack a stable matchId; history fallback can pull
 * the player's latest Swiftplay/competitive match instead.
 */
import type { MatchData } from './riot-types'
import { resolveMapName } from './riot-lookup-tables'

function normalizeQueueId(queueId: string): string {
  const map: Record<string, string> = {
    competitive: 'COMPETITIVE', unrated: 'CLASSIC', deathmatch: 'DEATHMATCH',
    spikerush: 'SPIKERUSH', swiftplay: 'SWIFTPLAY', snowball: 'SNOWBALL',
    premier: 'PREMIER', custom: 'CUSTOM', ggteam: 'ESCALATION',
    onefa: 'REPLICATION', hurm: 'TEAMDEATHMATCH', newmap: 'NEWMAP',
  }
  return map[queueId.toLowerCase()] ?? queueId.toUpperCase()
}

const PRACTICE_MODES = new Set(['CUSTOM', 'SHOOTING_RANGE', 'NEWMAP'])

export function recordingDurationMs(matchData: MatchData): number {
  if (matchData.endTime && matchData.recordingStartTime) {
    return Math.max(0, matchData.endTime - matchData.recordingStartTime)
  }
  if (matchData.startTime && matchData.endTime) {
    return Math.max(0, matchData.endTime - matchData.startTime)
  }
  return 0
}

export function mapFromMatchDetails(details: Record<string, unknown>): string | null {
  const matchInfo = details.matchInfo as Record<string, unknown> | undefined
  const mapId = matchInfo?.mapId as string | undefined
  return mapId ? resolveMapName(mapId) : null
}

export function queueFromMatchDetails(details: Record<string, unknown>): string | null {
  const matchInfo = details.matchInfo as Record<string, unknown> | undefined
  const queueId = matchInfo?.queueID as string | undefined
  return queueId ? normalizeQueueId(queueId) : null
}

export type MatchDetailsValidation = { apply: boolean; reason: string }

/**
 * Returns whether MatchDetails should be merged into this recording's timeline.
 */
export function shouldApplyMatchDetails(
  matchData: MatchData,
  details: Record<string, unknown>,
): MatchDetailsValidation {
  const localMode = (matchData.gameMode ?? '').toUpperCase()
  const detailsMode = queueFromMatchDetails(details)
  const matchInfo = details.matchInfo as Record<string, unknown> | undefined

  if (PRACTICE_MODES.has(localMode)) {
    if (detailsMode && detailsMode !== localMode) {
      return {
        apply: false,
        reason: `practice mode ${localMode} — details queue is ${detailsMode}`,
      }
    }
  }

  const localMap = matchData.map?.trim()
  const detailsMap = mapFromMatchDetails(details)
  if (localMap && detailsMap && localMap.toLowerCase() !== detailsMap.toLowerCase()) {
    return {
      apply: false,
      reason: `map mismatch (presence ${localMap} vs details ${detailsMap})`,
    }
  }

  const gameLengthMs = matchInfo?.gameLengthMillis as number | undefined
  const recordingMs = recordingDurationMs(matchData)
  if (
    typeof gameLengthMs === 'number'
    && gameLengthMs > 0
    && recordingMs >= 60_000
  ) {
    const diff = Math.abs(gameLengthMs - recordingMs)
    const tolerance = Math.max(120_000, Math.min(gameLengthMs, recordingMs) * 0.35)
    if (diff > tolerance) {
      return {
        apply: false,
        reason: `duration mismatch (recording ~${Math.round(recordingMs / 1000)}s vs match ~${Math.round(gameLengthMs / 1000)}s)`,
      }
    }
  }

  return { apply: true, reason: 'aligned' }
}

/** Skip match-history fallback when local session already looks like practice. */
export function shouldUseMatchHistoryFallback(matchData: MatchData): boolean {
  const mode = (matchData.gameMode ?? '').toUpperCase()
  if (PRACTICE_MODES.has(mode)) return false
  // Presence captured a map — prefer live data over "most recent match" guess.
  if (matchData.map) return false
  return true
}
