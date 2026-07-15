export type CoachReviewStatus = 'pending' | 'in_progress' | 'completed'

export interface CoachReviewSummary {
  status: CoachReviewStatus
  annotationCount: number
  coachName: string | null
}

const cache = new Map<number, CoachReviewSummary | null>()
const inFlight = new Map<number, Promise<CoachReviewSummary | null>>()

export function getCachedCoachReview(analysisId: number): CoachReviewSummary | null | undefined {
  return cache.get(analysisId)
}

export function setCachedCoachReview(analysisId: number, summary: CoachReviewSummary | null): void {
  cache.set(analysisId, summary)
}

export function clearCoachReviewCache(): void {
  cache.clear()
  inFlight.clear()
}

/** Fetch roster coach review status for an analysis (cached). */
export async function fetchCoachReviewSummary(analysisId: number): Promise<CoachReviewSummary | null> {
  if (cache.has(analysisId)) return cache.get(analysisId) ?? null
  const pending = inFlight.get(analysisId)
  if (pending) return pending

  const request = (async (): Promise<CoachReviewSummary | null> => {
    try {
      const review = await window.api.coach.getAnalysisReview(analysisId)
      if (!review?.id) {
        cache.set(analysisId, null)
        return null
      }
      const summary: CoachReviewSummary = {
        status: review.status as CoachReviewStatus,
        annotationCount: review.annotations?.length ?? 0,
        coachName: review.coach?.display_name ?? null,
      }
      cache.set(analysisId, summary)
      return summary
    } catch {
      cache.set(analysisId, null)
      return null
    } finally {
      inFlight.delete(analysisId)
    }
  })()
  inFlight.set(analysisId, request)
  return request
}

/** Load coach review summaries for a list of analyses (skips cache hits). */
export async function loadCoachReviewSummaries(
  analysisIds: number[],
): Promise<Record<number, CoachReviewSummary>> {
  const out: Record<number, CoachReviewSummary> = {}
  const toFetch = analysisIds.filter(id => !cache.has(id))
  await Promise.all(toFetch.map(async (id) => {
    await fetchCoachReviewSummary(id)
  }))
  for (const id of analysisIds) {
    const cached = cache.get(id)
    if (cached) out[id] = cached
  }
  return out
}
