/**
 * "Analyse again" on a failed cloud job only re-queues it on the API, which still holds the
 * match_data from the first upload. When that upload was stripped (data-quality block) or
 * sparse, the retry fails again with "match stats not available". Re-send the stats from
 * the saved recording, refreshed from Riot when possible, so the held job can dispatch.
 */
import type { MatchData } from './riot-types'
import { hasRichMatchData } from './match-data-quality'

export interface RetryMatchDataDeps {
  fetchMatchDetails: (matchId: string) => Promise<Record<string, unknown> | null>
  populateFromDetails: (timeline: MatchData, details: Record<string, unknown>) => void
  patchMatchData: (jobId: string, timeline: MatchData) => Promise<void>
  saveTimeline?: (timeline: MatchData) => void
}

export type RetryMatchDataResult = 'refetched' | 'saved_timeline' | 'no_match_data'

export async function resendMatchDataForRetry(
  jobId: string,
  timeline: MatchData | null,
  deps: RetryMatchDataDeps,
): Promise<RetryMatchDataResult> {
  if (!timeline) return 'no_match_data'

  if (timeline.matchId) {
    const details = await deps.fetchMatchDetails(timeline.matchId).catch(() => null)
    if (details) {
      timeline.matchDetails = details
      deps.populateFromDetails(timeline, details)
      if (hasRichMatchData(timeline)) {
        deps.saveTimeline?.(timeline)
        await deps.patchMatchData(jobId, timeline)
        return 'refetched'
      }
    }
  }

  if (!hasRichMatchData(timeline)) return 'no_match_data'
  await deps.patchMatchData(jobId, timeline)
  return 'saved_timeline'
}
