/**
 * Report coaching / upload pipeline failures to the API (→ Discord #staff-errors).
 * Use for operational failures — not expected user setup gaps (OBS disconnected, quota).
 */

import log from 'electron-log'
import { reportError } from './error-reporter'
import { isExpectedRecordingConfigError } from './recording-errors'

export type PipelinePhase = 'upload' | 'duel-clips' | 'analysis' | 'playback' | 'recording'

const SKIP_PATTERNS = [
  /analysis\.limit\.reached/i,
  /upgrade\.required/i,
  /archive\.limit\.reached/i,
  /quota/i,
]

function isExpectedPipelineError(message: string): boolean {
  if (isExpectedRecordingConfigError(message)) return true
  return SKIP_PATTERNS.some((re) => re.test(message))
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
