import log from 'electron-log'
import type { UploadManager } from './upload-manager'
import type { RecordingsStore } from './recordings-store'
import {
  asCompletedPollStatus,
  extractAnalysisIdFromPollResult,
  findAnalysisIdForJob,
  isTerminalPollSuccess,
  type AnalysisListRow,
} from './analysis-completion'
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
  reconcileOrphanedAnalyses?: () => Promise<void>
  fetchRecentAnalyses?: () => Promise<AnalysisListRow[]>
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

function enrichStatusWithAnalysisId(
  status: AnalysisPollStatus,
  analyses: AnalysisListRow[],
  jobId: string,
): AnalysisPollStatus {
  const result = (status.result ?? {}) as Record<string, unknown>
  if (extractAnalysisIdFromPollResult(result) != null) return status

  const fromHistory = findAnalysisIdForJob(analyses, jobId)
  if (fromHistory == null) return status

  return {
    ...status,
    result: { ...result, analysis_id: fromHistory },
  }
}

/** One-shot status check for jobs the UI still treats as in-flight. */
export async function reconcileStuckAnalysisJobs(deps: StuckAnalysisReconcilerDeps): Promise<number> {
  if (!deps.isAuthenticated()) return 0

  const jobs = collectStuckJobs(deps.recordingsStore)
  if (jobs.size === 0) return 0

  try {
    await deps.reconcileOrphanedAnalyses?.()
  } catch (err) {
    log.debug('[StuckAnalysis] orphan reconcile skipped', err instanceof Error ? err.message : err)
  }

  let analyses: AnalysisListRow[] = []
  try {
    analyses = await deps.fetchRecentAnalyses?.() ?? []
  } catch (err) {
    log.debug('[StuckAnalysis] recent analyses fetch skipped', err instanceof Error ? err.message : err)
  }

  const activeJobId = getActiveAnalysisPollJobId()
  let reconciled = 0

  for (const [jobId, ctx] of jobs) {
    if (activeJobId === jobId) continue

    try {
      let status = await deps.uploadManager.pollStatus(jobId)
      const rec = deps.recordingsStore.getByJobId(jobId)
      const recordingId = rec?.id ?? null

      if (status.status === 'completed' || isTerminalPollSuccess(status)) {
        status = enrichStatusWithAnalysisId(asCompletedPollStatus(status), analyses, jobId)
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
        if (recordingId) deps.recordingsStore.setAnalysisFailure(recordingId, status.error || 'Analysis failed')
        deps.onFailed({
          jobId,
          error: status.error || 'Analysis failed',
          recordingId,
        })
        reconciled++
        continue
      }

      const historyId = findAnalysisIdForJob(analyses, jobId)
      if (historyId != null) {
        clearPendingJob()
        deps.onCompleted({
          jobId,
          status: {
            job_id: jobId,
            status: 'completed',
            progress: 100,
            result: { analysis_id: historyId },
          },
          recordingId,
          agent: rec?.agent ?? ctx.agent ?? null,
          map: rec?.map ?? ctx.map ?? null,
          game: rec?.game ?? ctx.game ?? 'valorant',
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
