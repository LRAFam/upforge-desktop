import log from 'electron-log'
import type { UploadManager } from './upload-manager'
import type { RecordingsStore } from './recordings-store'
import { clearPendingJob } from './upload-manager'
import { readActivePendingJob } from './user-session'
import { getActiveAnalysisPollJobId, type AnalysisPollStatus } from './analysis-poll'

export interface ReconciledAnalysisContext {
  jobId: string
  status: AnalysisPollStatus
  recordingId: string | null
  agent: string | null
  map: string | null
  game: string
}

export interface StuckAnalysisReconcilerDeps {
  uploadManager: UploadManager
  recordingsStore: RecordingsStore
  isAuthenticated: () => boolean
  onCompleted: (ctx: ReconciledAnalysisContext) => void
  onFailed: (ctx: { jobId: string; error: string; recordingId: string | null }) => void
  resumePoll: (jobId: string, context: { agent?: string; map?: string; game?: string }) => void
}

function collectStuckJobs(recordingsStore: RecordingsStore): Map<string, { agent?: string; map?: string; game?: string }> {
  const jobs = new Map<string, { agent?: string; map?: string; game?: string }>()

  const pending = readActivePendingJob()
  if (pending?.job_id) {
    jobs.set(pending.job_id, {
      agent: pending.agent,
      map: pending.map,
      game: pending.game,
    })
  }

  for (const rec of recordingsStore.listStuckAnalysisJobs()) {
    if (!rec.jobId) continue
    jobs.set(rec.jobId, {
      agent: rec.agent ?? undefined,
      map: rec.map ?? undefined,
      game: rec.game ?? undefined,
    })
  }

  return jobs
}

/** One-shot status check for jobs the UI still treats as in-flight. */
export async function reconcileStuckAnalysisJobs(deps: StuckAnalysisReconcilerDeps): Promise<number> {
  if (!deps.isAuthenticated()) return 0

  const jobs = collectStuckJobs(deps.recordingsStore)
  if (jobs.size === 0) return 0

  const activeJobId = getActiveAnalysisPollJobId()
  let reconciled = 0

  for (const [jobId, ctx] of jobs) {
    if (activeJobId === jobId) continue

    try {
      const status = await deps.uploadManager.pollStatus(jobId)
      const rec = deps.recordingsStore.getByJobId(jobId)
      const recordingId = rec?.id ?? null

      if (status.status === 'completed') {
        clearPendingJob()
        deps.onCompleted({
          jobId,
          status,
          recordingId,
          agent: rec?.agent ?? ctx.agent ?? null,
          map: rec?.map ?? ctx.map ?? null,
          game: rec?.game ?? ctx.game ?? 'valorant',
        })
        reconciled++
        continue
      }

      if (status.status === 'failed') {
        clearPendingJob()
        if (recordingId) deps.recordingsStore.clearAnalysisPipeline(recordingId)
        deps.onFailed({
          jobId,
          error: status.error || 'Analysis failed',
          recordingId,
        })
        reconciled++
        continue
      }

      if ((status.status === 'queued' || status.status === 'processing') && !activeJobId) {
        deps.resumePoll(jobId, ctx)
      }
    } catch (err) {
      log.debug('[StuckAnalysis] reconcile skipped for job', jobId, err instanceof Error ? err.message : err)
    }
  }

  return reconciled
}
