import type { PendingRecording } from '../env'

export function isRecordingStatsSyncActive(
  recording: Pick<PendingRecording, 'matchStatsSyncPaused' | 'analysisReadiness' | 'lastAnalysisError'>,
): boolean {
  if (recording.matchStatsSyncPaused || recording.lastAnalysisError) return false
  const state = recording.analysisReadiness?.state
  return state === 'syncing' || state === 'waiting_match_data'
}
