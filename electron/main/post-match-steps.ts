/**
 * Pure post-match step decision after the local VOD is saved.
 * Keeps match-end branching out of index.ts spaghetti.
 */

export type PostMatchNextStep =
  | 'pending_manual'
  | 'pending_waiting_stats'
  | 'upload_analyse'

export interface PostMatchStepInput {
  autoAnalyse: boolean
  readinessReady: boolean
  /** readiness.state when known — syncing / waiting_match_data / etc. */
  readinessState?: string | null
}

export function decidePostMatchNextStep(input: PostMatchStepInput): PostMatchNextStep {
  if (!input.autoAnalyse) return 'pending_manual'
  if (!input.readinessReady) return 'pending_waiting_stats'
  return 'upload_analyse'
}

export function isWaitingMatchDataState(state: string | null | undefined): boolean {
  return state === 'syncing' || state === 'waiting_match_data'
}
