import type { PendingRecording } from '../env.d.ts'
import { recordingDemoPending } from './recording-demo-status'

export type PendingMatchLifecycleState =
  | 'action_required'
  | 'preparing'
  | 'uploading'
  | 'analysing'
  | 'unavailable'

export type PendingMatchPrimaryAction =
  | 'analyse'
  | 'retry_analysis'
  | 'retry_stats'
  | 'attach_replay'
  | null

export function pendingMatchLifecycleState(rec: PendingRecording): PendingMatchLifecycleState {
  if (rec.pipelineStatus === 'uploading') return 'uploading'
  if (rec.pipelineStatus === 'analysing') return 'analysing'
  if (pendingMatchPrimaryAction(rec)) return 'action_required'
  const readiness = rec.analysisReadiness?.state
  if (readiness === 'file_missing' || readiness === 'file_unreadable' || readiness === 'unavailable') {
    return 'unavailable'
  }
  return 'preparing'
}

export function pendingMatchPrimaryAction(rec: PendingRecording): PendingMatchPrimaryAction {
  if (rec.clipsOnly || rec.analysisId != null) return null
  if (rec.pipelineStatus === 'uploading' || rec.pipelineStatus === 'analysing') return null
  if (rec.pipelineDeferReason === 'recording') return null
  if (rec.lastAnalysisError) return 'retry_analysis'
  if (recordingDemoPending(rec)) return 'attach_replay'
  if (rec.matchStatsSyncPaused) return 'retry_stats'
  if (rec.analysisReadiness?.ready) return 'analyse'
  return null
}

export function pendingMatchStatusLabel(rec: PendingRecording): string {
  const action = pendingMatchPrimaryAction(rec)
  if (action === 'analyse') return 'Ready for coaching'
  if (action === 'retry_analysis') return 'Analysis needs retry'
  if (action === 'retry_stats') return 'Stats sync paused'
  if (action === 'attach_replay') return rec.game === 'deadlock' ? 'Replay required' : 'Demo required'

  const state = pendingMatchLifecycleState(rec)
  if (state === 'uploading') return 'Uploading footage'
  if (state === 'analysing') return 'Coaching in progress'
  if (state === 'unavailable') return 'Footage unavailable'
  if (rec.analysisReadiness?.state === 'finalizing') return 'Finalizing footage'
  return 'Preparing match'
}

export function pendingMatchActionLabel(rec: PendingRecording): string | null {
  const action = pendingMatchPrimaryAction(rec)
  if (action === 'analyse') return 'Run AI coaching'
  if (action === 'retry_analysis') return 'Retry analysis'
  if (action === 'retry_stats') return 'Retry stats sync'
  if (action === 'attach_replay') return rec.game === 'deadlock' ? 'Attach replay' : 'Attach demo'
  return null
}
