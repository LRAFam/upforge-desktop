import type { RecordingsStore } from './recordings-store'
import type { UploadManager } from './upload-manager'
import { clearPendingJob } from './upload-manager'
import { readActivePendingJob } from './user-session'
import { getActiveAnalysisPollJobId, stopActiveAnalysisPoll } from './analysis-poll'
import { clearDeferredUploadRetry } from './match-priority-guard'

export interface AbortInFlightAnalysisDeps {
  recordingsStore: RecordingsStore
  uploadManager: UploadManager | null
  activeUploadRecordingIds: Set<string>
}

/** Stop local upload/poll wait for a recording. Cloud job may still finish on the server. */
export function abortInFlightAnalysis(
  deps: AbortInFlightAnalysisDeps,
  recordingId: string,
): { ok: boolean; error?: string } {
  const rec = deps.recordingsStore.getById(recordingId)
  if (!rec) return { ok: false, error: 'Recording not found' }

  const uploading = rec.pipelineStatus === 'uploading'
  const analysing = rec.pipelineStatus === 'analysing'
  const waitingOnServer = rec.analysed && rec.analysisId == null && !rec.lastAnalysisError

  if (!uploading && !analysing && !waitingOnServer) {
    return { ok: true }
  }

  if (rec.jobId && getActiveAnalysisPollJobId() === rec.jobId) {
    stopActiveAnalysisPoll()
  }

  if (deps.activeUploadRecordingIds.has(recordingId)) {
    deps.uploadManager?.abort()
    deps.activeUploadRecordingIds.delete(recordingId)
  }

  const pending = readActivePendingJob()
  if (pending?.job_id && pending.job_id === rec.jobId) {
    clearPendingJob()
  }

  clearDeferredUploadRetry(recordingId)

  if (rec.analysed && rec.jobId) {
    deps.recordingsStore.setAnalysisFailure(
      recordingId,
      'Stopped waiting — analysis may still finish on the server. Tap Retry to check.',
      { hint: 'Your cloud recording is safe. Retry resumes the status check.' },
    )
  } else if (uploading) {
    deps.recordingsStore.setPipelineStatus(recordingId, 'pending')
  } else {
    deps.recordingsStore.clearAnalysisPipeline(recordingId)
  }

  return { ok: true }
}
