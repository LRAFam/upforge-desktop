/**
 * Whether Riot MatchDetails enriched the timeline with authoritative stats.
 * Mirrors upforge-api MatchDataQualityService and AI desktop_has_rich_match_data().
 */
import type { MatchData } from './riot-types'

export function hasRichMatchData(timeline: MatchData | null | undefined): boolean {
  if (!timeline) return false

  const finalStats = timeline.finalStats
  if (finalStats && finalStats.kills != null) return true

  // Align with API MatchDataQualityService + AI desktop_has_rich_match_data (kills required).
  return (timeline.killEvents?.length ?? 0) > 0
    || (timeline.playerKills?.length ?? 0) > 0
}

/** Desktop waits up to this long for Riot MatchDetails before upload (ms). */
export const MATCH_DETAILS_ENRICH_MAX_MS = 180_000
