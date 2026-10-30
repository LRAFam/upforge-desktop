/** Whether a Matches row offers Deadlock "Review replay", shows it in progress, or neither. */
export type DeadlockReviewRowState = 'available' | 'in_progress' | 'none'

export function deadlockReviewState(rec: {
  game: string
  cloudOnly?: boolean
  hasLocalFile?: boolean
  deadlockReviewJobId?: string
  analysisReadiness?: { ready?: boolean } | null
}): DeadlockReviewRowState {
  if (rec.game !== 'deadlock' || rec.cloudOnly) return 'none'
  // Already has a real kill timeline: nothing to review for the timeline.
  if (rec.analysisReadiness?.ready) return 'none'
  if (rec.deadlockReviewJobId) return 'in_progress'
  return rec.hasLocalFile === false ? 'none' : 'available'
}
