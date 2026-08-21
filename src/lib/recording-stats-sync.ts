import type { PendingRecording } from '../env'

export function isRecordingStatsSyncActive(
  recording: Pick<PendingRecording, 'matchStatsSyncPaused' | 'analysisReadiness'>,
): boolean {
  if (recording.matchStatsSyncPaused) return false
  const state = recording.analysisReadiness?.state
  return state === 'syncing' || state === 'waiting_match_data' || state === 'finalizing'
}
