/**
 * Guard against attaching Riot MatchDetails from the wrong game to a recording.
 * Custom/practice lobbies often lack a stable matchId; history fallback can pull
 * the player's latest Swiftplay/competitive match instead.
 */
import type { MatchData } from './riot-types'
import { resolveMapName } from './riot-lookup-tables'
import { normalizeQueueId } from './riot-queue-id'

const PRACTICE_MODES = new Set(['CUSTOM', 'SHOOTING_RANGE', 'NEWMAP'])

export function recordingDurationMs(matchData: MatchData): number {
  // Riot gameLengthMillis is in-round gameplay only — exclude load-in before gameplayStartTime.
  if (
    matchData.gameplayStartTime != null
    && matchData.endTime != null
    && matchData.endTime > matchData.gameplayStartTime
  ) {
    const gameplayMs = matchData.endTime - matchData.gameplayStartTime
    if (gameplayMs >= 60_000) return gameplayMs
  }
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

const RECOVERY_START_TOLERANCE_MS = 10 * 60_000
const RECOVERY_END_TOLERANCE_MS = 15 * 60_000

export function recoveredMatchStartAligns(recordingStartMs: number, matchStartMs: number): boolean {
  return Number.isFinite(recordingStartMs)
    && Number.isFinite(matchStartMs)
    && Math.abs(matchStartMs - recordingStartMs) <= RECOVERY_START_TOLERANCE_MS
}

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
    // Riot gameLengthMillis excludes plenty of real VOD time (loading, buy phase,
    // round-end downtime). Keep this as a wrong-match guard, not a strict clock sync.
    const tolerance = Math.max(120_000, Math.min(gameLengthMs, recordingMs) * 0.75)
    if (diff > tolerance) {
      return {
        apply: false,
        reason: `duration mismatch (recording ~${Math.round(recordingMs / 1000)}s vs match ~${Math.round(gameLengthMs / 1000)}s)`,
      }
    }
  }

  return { apply: true, reason: 'aligned' }
}

/**
 * Orphan recovery has no captured map/mode to cross-check, so require canonical
 * Riot match timing to align with the filesystem recording interval.
 */
export function shouldApplyRecoveredMatchDetails(
  matchData: MatchData,
  details: Record<string, unknown>,
): MatchDetailsValidation {
  const recordingStartMs = matchData.recordingStartTime
  const recordingEndMs = matchData.endTime
  if (!Number.isFinite(recordingStartMs) || !Number.isFinite(recordingEndMs) || recordingEndMs == null) {
    return { apply: false, reason: 'recording timing missing' }
  }

  const matchInfo = details.matchInfo as Record<string, unknown> | undefined
  const matchStartMs = matchInfo?.gameStartMillis
  const gameLengthMs = matchInfo?.gameLengthMillis
  if (typeof matchStartMs !== 'number' || !Number.isFinite(matchStartMs)) {
    return { apply: false, reason: 'Riot matchInfo.gameStartMillis missing' }
  }
  if (typeof gameLengthMs !== 'number' || !Number.isFinite(gameLengthMs) || gameLengthMs <= 0) {
    return { apply: false, reason: 'Riot matchInfo.gameLengthMillis missing' }
  }

  if (!recoveredMatchStartAligns(recordingStartMs, matchStartMs)) {
    return { apply: false, reason: 'match start does not align with recording' }
  }

  const matchEndMs = matchStartMs + gameLengthMs
  if (Math.abs(matchEndMs - recordingEndMs) > RECOVERY_END_TOLERANCE_MS) {
    return { apply: false, reason: 'match end does not align with recording' }
  }

  return shouldApplyMatchDetails(matchData, details)
}

/** Skip match-history fallback when local session already looks like practice. */
export function shouldUseMatchHistoryFallback(matchData: MatchData): boolean {
  const mode = (matchData.gameMode ?? '').toUpperCase()
  if (PRACTICE_MODES.has(mode)) return false
  return true
}
