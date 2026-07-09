/**
 * Whether Riot MatchDetails enriched the timeline with authoritative stats.
 * Mirrors upforge-api MatchDataQualityService and AI desktop_has_rich_match_data().
 */
import type { MatchData } from './riot-types'

export function hasRichMatchData(timeline: MatchData | null | undefined): boolean {
  if (!timeline) return false

  if ((timeline.killEvents?.length ?? 0) > 0 || (timeline.playerKills?.length ?? 0) > 0) {
    return true
  }

  const fs = timeline.finalStats
  if (!fs) return false

  return ((fs.kills ?? 0) + (fs.deaths ?? 0) + (fs.assists ?? 0)) > 0
}

/** Demo has kills but none matched the configured CS2 Steam name. */
export function cs2PlayerIdentityMismatch(timeline: MatchData | null | undefined): boolean {
  if (!timeline) return false
  const totalKills = timeline.killEvents?.length ?? 0
  const playerKills = timeline.playerKills?.length ?? 0
  return totalKills > 0 && playerKills === 0
}

/** Desktop waits up to this long for Riot MatchDetails before upload (ms). */
export const MATCH_DETAILS_ENRICH_MAX_MS = 180_000

/** CS2 GOTV replays often land 5–15 min after match end; up to ~30 min at peak. */
export const CS2_DEMO_SYNC_MAX_MS = 35 * 60 * 1000

/** Short blocking poll at match end — background sync continues up to CS2_DEMO_SYNC_MAX_MS. */
export const CS2_DEMO_POST_MATCH_QUICK_POLL_MS = 120_000

export function demoSyncMaxMsForGame(game: string | null | undefined): number {
  if (game === 'cs2') return CS2_DEMO_SYNC_MAX_MS
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
  return 'CS2 demo not found after 35 minutes — download the GOTV replay in-game or restart Steam and rescan. Demo timing is controlled by Steam, not UpForge.'
}

/** CS2 / Deadlock match ended before replay/demo stats linked — skip interrupting post-game UI. */
export function shouldDeferPostGameForDemoSync(
  game: string | null | undefined,
  timeline: MatchData | null | undefined,
): boolean {
  if (game !== 'cs2' && game !== 'deadlock') return false
  return !hasRichMatchData(timeline)
}

export function cs2RecordingSavedDashboardMessage(map: string | null | undefined): string {
  const mapLabel = map ? ` on ${map}` : ''
  return `CS2 recording saved${mapLabel}. GOTV demos come from Steam (usually 5–15 min) — we'll notify you when the timeline links.`
}

export function deadlockRecordingSavedDashboardMessage(map: string | null | undefined): string {
  const mapLabel = map ? ` on ${map}` : ''
  return `Deadlock recording saved${mapLabel}. Replay data syncs separately — check the dashboard when ready.`
}
