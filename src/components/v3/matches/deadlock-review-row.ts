import { deadlockReplayReviewed } from '../../../lib/match-lifecycle'

/** Whether a Matches row offers Deadlock "Review replay", shows it in progress, or neither. */
export type DeadlockReviewRowState = 'available' | 'in_progress' | 'none'

export function deadlockReviewState(rec: {
  game: string
  cloudOnly?: boolean
  hasLocalFile?: boolean
  deadlockReviewJobId?: string
  analysisReadiness?: { ready?: boolean; state?: string } | null
}): DeadlockReviewRowState {
  if (rec.game !== 'deadlock' || rec.cloudOnly) return 'none'
  // Already has a real replay kill timeline (main reports it as reviewed): nothing left to review.
  if (rec.analysisReadiness?.ready || deadlockReplayReviewed(rec)) return 'none'
  if (rec.deadlockReviewJobId) return 'in_progress'
  return rec.hasLocalFile === false ? 'none' : 'available'
}
