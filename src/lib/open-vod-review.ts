import type { Router } from 'vue-router'
import { pendingTimeline } from '../stores/pendingTimeline'

export interface OpenAnalysisVodReviewOpts {
  comparisonId?: string
  coachNotes?: boolean
  seekMs?: number
  source?: string
  /** A caller can cancel while the timeline loads (account change, closed view, or unmount). */
  isCurrent?: () => boolean
}

function trackDesktopReportOpened(analysisId: number, source: string): void {
  void window.api.funnel?.trackReportOpened?.({
    analysis_id: analysisId,
    source,
  })
}

/** Load analysis timeline and navigate to VOD review. */
export async function openAnalysisVodReview(
  router: Router,
  analysisId: number,
  opts?: OpenAnalysisVodReviewOpts,
): Promise<boolean> {
  if (opts?.isCurrent?.() === false) return false
  const data = await window.api.analyses.getTimeline(analysisId)
  if (!data || opts?.isCurrent?.() === false) return false
  pendingTimeline.value = data
  const query: Record<string, string> = { timelineId: String(analysisId) }
  if (opts?.comparisonId) query.comparisonId = opts.comparisonId
  if (opts?.coachNotes) query.coachNotes = '1'
  if (opts?.seekMs != null && !Number.isNaN(opts.seekMs) && opts.seekMs >= 0) {
    query.seekMs = String(Math.round(opts.seekMs))
  }
  await router.push({ path: '/vod-review', query })
  if (opts?.isCurrent?.() !== false) trackDesktopReportOpened(analysisId, opts?.source ?? 'desktop_vod_review')
  return true
}
