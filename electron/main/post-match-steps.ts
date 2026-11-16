import { deadlockAllowsAutoAnalyse } from './deadlock-auto-analyse'

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

/**
 * Historical recordings predate explicit auto-analysis intent. Treat a missing
 * value as manual-only so an app reopen or later match cannot opt them in.
 * A recorded failure requires an explicit retry; stats updates must not restart it.
 * Deadlock Standard / Street Brawl matches are never analysed automatically (deadlock-auto-analyse.ts).
 */
export function canAutoEnqueueRecording(recording: {
  autoAnalyseRequested?: boolean
  lastAnalysisError?: string | null
  game?: string | null
  gameMode?: string | null
}): boolean {
  if (recording.game === 'deadlock' && !deadlockAllowsAutoAnalyse(recording.gameMode)) return false
  return recording.autoAnalyseRequested === true && !recording.lastAnalysisError
}

export function decidePostMatchNextStep(input: PostMatchStepInput): PostMatchNextStep {
  if (!input.autoAnalyse) return 'pending_manual'
  if (!input.readinessReady) return 'pending_waiting_stats'
  return 'upload_analyse'
}

export function isWaitingMatchDataState(state: string | null | undefined): boolean {
  return state === 'syncing' || state === 'waiting_match_data'
}
