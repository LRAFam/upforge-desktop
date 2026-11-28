/**
 * Whether Riot MatchDetails enriched the timeline with authoritative stats.
 * Mirrors upforge-api MatchDataQualityService and AI desktop_has_rich_match_data().
 */
import type { MatchData } from './riot-types'

export function hasRichMatchData(timeline: MatchData | null | undefined): boolean {
  if (!timeline) return false

  if (hasKillRows(timeline)) return true

  const fs = timeline.finalStats
  if (!fs) return false

  return ((fs.kills ?? 0) + (fs.deaths ?? 0) + (fs.assists ?? 0)) > 0
}

/** At least one kill row in killEvents OR playerKills (an empty killEvents must not hide playerKills). */
export function hasKillRows(timeline: MatchData | null | undefined): boolean {
  if (!timeline) return false
  return (timeline.killEvents?.length ?? 0) > 0 || (timeline.playerKills?.length ?? 0) > 0
}

/**
 * CS2 / Deadlock coaching is "from the demo": K/D/A totals alone are not demo data, and
 * Deadlock kill rows from the live console log are not either. Mirrors API
 * MatchDataQualityService::isReadyForCs2Desktop (kill rows required); stricter on live-only rows.
 */
export function hasDemoKillRows(timeline: MatchData | null | undefined): boolean {
  if (!hasKillRows(timeline)) return false
  return timeline?.killRowsSource !== 'live_log'
}

/** Per-game Analyse data bar: demo kill rows for CS2 / Deadlock, otherwise hasRichMatchData. */
export function hasRichMatchDataForGame(
  game: string | null | undefined,
  timeline: MatchData | null | undefined,
): boolean {
  if (game === 'cs2' || game === 'deadlock') return hasDemoKillRows(timeline)
  return hasRichMatchData(timeline)
}

/**
 * Schedule the ~90s late clip / MatchDetails retry only when the timeline is
 * still sparse *after* enrich — not from the pre-enrich snapshot.
 */
export function shouldScheduleLateClipRetry(
  game: string,
  timeline: MatchData | null | undefined,
  matchId?: string | null,
): boolean {
  if (hasRichMatchDataForGame(game, timeline)) return false
  return game === 'valorant' || game === 'cs2' || game === 'deadlock' || !!matchId || !!timeline?.matchId
}

/**
 * True when MatchDetails still needs to supply core kill/round stats.
 *
 * Do NOT gate on plantLocation or spatialSummary plants here — spatial enrichment
 * runs after MatchDetails succeed. Requiring those caused endless "Waiting for Riot
 * match stats" even when Riot had already returned full kill data.
 */
export function timelineNeedsEnrichRefresh(timeline: MatchData): boolean {
  const hasCore = (timeline.killEvents?.length ?? 0) > 0
    || (timeline.roundSummaries?.length ?? 0) > 0
  return !hasCore
}

/** Demo has kills but none matched the configured CS2 Steam name. */
export function cs2PlayerIdentityMismatch(timeline: MatchData | null | undefined): boolean {
  if (!timeline) return false
  const totalKills = timeline.killEvents?.length ?? 0
  const playerKills = timeline.playerKills?.length ?? 0
  return totalKills > 0 && playerKills === 0
}

/** Desktop waits up to this long for Riot MatchDetails before *blocking* upload (ms). */
export const MATCH_DETAILS_ENRICH_MAX_MS = 180_000

/**
 * LoL Match-V5 wait window. Matches API hold budget:
 * HOLD_MINUTES(4) + MATCH_DATA_MAX_WAIT_ATTEMPTS(4) * MATCH_DATA_RETRY_MINUTES(2) = 12m.
 */
export const LOL_MATCH_V5_SYNC_MAX_MS = 12 * 60_000

/**
 * Background Valorant MatchDetails poll cadence while a pending VOD still lacks stats.
 * Keeps trying for the life of the app session (no hard stop) with backoff so we
 * do not hammer Riot while the user sits in MENUS.
 */
export function valorantMatchStatsPollIntervalMs(
  elapsedMs: number,
  recordingActive = false,
): number {
  if (recordingActive) return 60_000
  const elapsedMin = elapsedMs / 60_000
  if (elapsedMin < 3) return 15_000
  if (elapsedMin < 10) return 30_000
  if (elapsedMin < 30) return 60_000
  return 120_000
}

/** CS2 GOTV replays often land 5–15 min after match end; up to ~30 min at peak. */
export const CS2_DEMO_SYNC_MAX_MS = 35 * 60 * 1000

/** Short blocking poll at match end — background sync continues up to CS2_DEMO_SYNC_MAX_MS. */
export const CS2_DEMO_POST_MATCH_QUICK_POLL_MS = 120_000

/** Background demo poll cadence — backs off as GOTV wait lengthens. */
export function cs2DemoSyncPollIntervalMs(elapsedMs: number, recordingActive = false): number {
  if (recordingActive) return 30_000
  const elapsedMin = elapsedMs / 60_000
  if (elapsedMin < 5) return 5_000
  if (elapsedMin < 15) return 10_000
  if (elapsedMin < 30) return 20_000
  return 30_000
}

export function demoSyncMaxMsForGame(game: string | null | undefined): number {
  if (game === 'cs2' || game === 'deadlock') return CS2_DEMO_SYNC_MAX_MS
  if (game === 'lol') return LOL_MATCH_V5_SYNC_MAX_MS
  return MATCH_DETAILS_ENRICH_MAX_MS
}

/** User-facing CS2 demo wait copy aligned with GOTV availability timing. */
export function cs2DemoSyncMessage(elapsedMs: number): string {
  const elapsedMin = Math.max(0, Math.floor(elapsedMs / 60_000))
  if (elapsedMin < 5) {
    return `Waiting for Steam demo (${elapsedMin}m) — usually 5–15 min after the match`
  }
  if (elapsedMin < 15) {
    return `Still waiting for Steam demo (${elapsedMin}m) — most land within 5–15 min`
  }
  if (elapsedMin < 30) {
    return `Still waiting for Steam demo (${elapsedMin}m) — can take up to 30 min at peak`
  }
  return `Still waiting for Steam demo (${elapsedMin}m) — try restarting Steam, then rescan`
}

export function cs2DemoUnavailableMessage(): string {
  return 'CS2 demo not found — make sure Steam is running and logged in, then tap Scan for replay. Valve demos expire after ~30 days.'
}

/** CS2 / Deadlock — demo is optional; user attaches when ready. */
export function shouldDeferPostGameForDemoSync(
  game: string | null | undefined,
  _timeline: MatchData | null | undefined,
): boolean {
  return false
}

export function demoAttachHint(game: string | null | undefined): string {
  if (game === 'cs2') {
    return 'Coaching starts when you close CS2: UpForge then fetches the demo from Steam. Between matches, download the GOTV demo in CS2 (Watch → Your Matches) and attach the .dem file.'
  }
  if (game === 'deadlock') return DEADLOCK_REVIEW_REPLAY_HINT
  return ''
}

/**
 * Deadlock replays are read in the cloud ("Review replay"); a local .dem attach cannot parse them,
 * so every Deadlock "attach" prompt points here instead of the CS2 attach flow.
 */
export const DEADLOCK_REVIEW_REPLAY_HINT = 'Choose Review replay on this match (uses 1 analysis). UpForge finds the replay, reads it in the cloud and adds your kills and deaths.'

/** Deadlock Valve replay wait copy (same timing band as CS2 GOTV). */
export function deadlockDemoSyncMessage(elapsedMs: number): string {
  const elapsedMin = Math.max(0, Math.floor(elapsedMs / 60_000))
  if (elapsedMin < 5) {
    return `Waiting for Deadlock replay (${elapsedMin}m). Usually a few minutes after the match`
  }
  if (elapsedMin < 15) {
    return `Still waiting for Deadlock replay (${elapsedMin}m). Keep Steam open, or choose Review replay on this match`
  }
  if (elapsedMin < 30) {
    return `Still waiting for Deadlock replay (${elapsedMin}m). Choose Review replay on this match if needed`
  }
  return `Deadlock replay not linked (${elapsedMin}m). Choose Review replay on this match for coaching`
}

export function cs2RecordingSavedDashboardMessage(map: string | null | undefined): string {
  const mapLabel = map ? ` on ${map}` : ''
  return `CS2 recording saved${mapLabel}. Analyse unlocks when the demo is linked.`
}

export function deadlockRecordingSavedDashboardMessage(map: string | null | undefined): string {
  const mapLabel = map ? ` on ${map}` : ''
  return `Deadlock recording saved${mapLabel}. Analyse unlocks when the replay is linked.`
}
