import type { AnalysisPollStatus } from './analysis-poll'

export function extractAnalysisIdFromPollResult(
  result?: Record<string, unknown> | null,
): number | undefined {
  if (!result || typeof result !== 'object') return undefined
  const id = result.analysis_id ?? result.analysis_log_id
  return typeof id === 'number' && Number.isFinite(id) ? id : undefined
}

/**
 * Desktop poll should treat a job as done when the server has a finished payload,
 * even if status is still "processing" at 100% (AI callback ordering gap).
 */
export function isTerminalPollSuccess(status: AnalysisPollStatus): boolean {
  if (status.status === 'completed') return true

  const result = status.result as Record<string, unknown> | undefined
  const analysisId = extractAnalysisIdFromPollResult(result)
  if (analysisId != null) return true

  if (status.status !== 'processing' && status.status !== 'queued') return false

  const progress = status.progress ?? 0
  if (progress < 100) return false

  if (result && typeof result.overall_score === 'number') return true
  if (result?.success === true && analysisId != null) return true
  if (Array.isArray(result?.match_highlights) && result.match_highlights.length > 0) return true

  return false
}

export function asCompletedPollStatus(status: AnalysisPollStatus): AnalysisPollStatus {
  if (status.status === 'completed') return status
  return { ...status, status: 'completed', progress: 100 }
}

export interface AnalysisListRow {
  id: number
  job_id?: string | null
  overall_score?: number | null
}

export function findAnalysisIdForJob(
  analyses: AnalysisListRow[],
  jobId: string,
): number | undefined {
  const hit = analyses.find((a) => a.job_id === jobId)
  return hit?.id
}
