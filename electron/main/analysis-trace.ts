import { APP_VERSION } from './app-version'

/**
 * Ids that link a support bundle to the API job (and through it the AI logs):
 * the app version on API calls and the latest analysis job this session started.
 */
export interface AnalysisJobTrace {
  jobId: string
  game: string
  clientRecordingId: string | null
  at: number
}

let lastJob: AnalysisJobTrace | null = null

/** Header the API stores on the job (`client_version`). */
export function clientVersionHeaders(): Record<string, string> {
  return { 'X-Client-Version': APP_VERSION }
}

/** Remember the job a presign just created. */
export function noteAnalysisJob(
  job: { jobId: string; game: string; clientRecordingId?: string | null },
  at = Date.now(),
): void {
  if (!job.jobId) return
  lastJob = { jobId: job.jobId, game: job.game, clientRecordingId: job.clientRecordingId ?? null, at }
}

export function lastAnalysisJob(): AnalysisJobTrace | null {
  return lastJob
}

export function resetAnalysisTraceForTests(): void {
  lastJob = null
}

/** The `=== IDS ===` header of the support bundle. */
export function formatTraceSection(opts: { userId: number | null; version: string; last: AnalysisJobTrace | null }): string[] {
  const lines = [
    '=== IDS ===',
    `User id: ${opts.userId ?? 'not signed in'}`,
    `App version: ${opts.version}`,
  ]
  if (!opts.last) {
    lines.push('Last job id: none this session')
  } else {
    lines.push(
      `Last job id: ${opts.last.jobId}`,
      `Last job game: ${opts.last.game}`,
      `Last job started: ${new Date(opts.last.at).toISOString()}`,
    )
  }
  lines.push(`Client recording id: ${opts.last?.clientRecordingId ?? 'none'}`)
  return lines
}
