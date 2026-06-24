import type { Router } from 'vue-router'
import { pendingTimeline } from '../stores/pendingTimeline'

export interface OpenAnalysisVodReviewOpts {
  coachNotes?: boolean
  seekMs?: number
}

/** Load analysis timeline and navigate to VOD review. */
export async function openAnalysisVodReview(
  router: Router,
  analysisId: number,
  opts?: OpenAnalysisVodReviewOpts,
): Promise<boolean> {
  const data = await window.api.analyses.getTimeline(analysisId)
  if (!data) return false
  pendingTimeline.value = data
  const query: Record<string, string> = { timelineId: String(analysisId) }
  if (opts?.coachNotes) query.coachNotes = '1'
  if (opts?.seekMs != null && !Number.isNaN(opts.seekMs) && opts.seekMs >= 0) {
    query.seekMs = String(Math.round(opts.seekMs))
  }
  await router.push({ path: '/vod-review', query })
  return true
}
