/**
 * Report coaching / upload pipeline failures to the API (→ Discord #staff-errors).
 * Use for operational failures — not expected user setup gaps (OBS disconnected, quota).
 */

import log from 'electron-log'
import { reportError } from './error-reporter'
import { isExpectedRecordingConfigError } from './recording-errors'
import type { AnalysisFailureKind } from '../../src/lib/analysis-failure-messages'

export type PipelinePhase = 'upload' | 'duel-clips' | 'analysis' | 'playback' | 'recording'

/** User-facing failures — logged locally, not staff Discord noise. */
const USER_RECOVERABLE_ANALYSIS_KINDS = new Set<AnalysisFailureKind>([
  'refunded_data',
  'refunded_timeout',
  'refunded_quality',
  'refunded_generic',
  'integrity',
  'upload',
  'quota',
  'clips_only',
])

const SKIP_PATTERNS = [
  /analysis\.limit\.reached/i,
  /upgrade\.required/i,
  /archive\.limit\.reached/i,
  /quota/i,
  /upload aborted/i,
  /compression cancelled/i,
  /recording too large/i,
  /too large to upload/i,
  /clips.?only/i,
  /NoSuchUpload/i,
  /upload session expired/i,
  /upload_session_expired/i,
  /recording file is incomplete/i,
  /recording is incomplete/i,
  /cannot extract duel clips/i,
  /moov atom not found/i,
  /job not found/i,
  /socket hang up/i,
  /econnreset/i,
  /econnaborted/i,
  /etimedout/i,
  /epipe/i,
  /enotfound/i,
  /eai_again/i,
  /enoent/i,
  /recording file not found/i,
  /recording file was removed/i,
  /request failed \(5\d\d\)/i,
  /Recording unreadable/i,
  /ffmpeg timed out/i,
  /Recording probe timed out/i,
  /S3 upload failed \(HTTP 5\d\d\)/i,
  /temporarily unavailable/i,
  /slowdown|please reduce your request rate/i,
]

function isExpectedPipelineError(message: string): boolean {
  if (isExpectedRecordingConfigError(message)) return true
  return SKIP_PATTERNS.some((re) => re.test(message))
}

export function shouldReportAnalysisPipelineError(
  kind: AnalysisFailureKind,
  rawError: string,
): boolean {
  if (USER_RECOVERABLE_ANALYSIS_KINDS.has(kind)) return false
  return !isExpectedPipelineError(rawError)
}

export function reportPipelineError(
  phase: PipelinePhase,
  message: string,
  extra?: Record<string, unknown>,
): void {
  log.warn(`[Pipeline:${phase}] ${message}`, extra ?? {})
  if (isExpectedPipelineError(message)) return
  void reportError({
    message: `[Pipeline:${phase}] ${message}`.slice(0, 1000),
    component: `desktop:Pipeline:${phase}`,
    extra: { phase, ...extra },
  })
}
