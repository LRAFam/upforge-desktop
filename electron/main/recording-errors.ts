/**
 * Centralized recording error reporting for telemetry and user-facing messages.
 */

import log from 'electron-log'
import { reportError } from './error-reporter'
import type { RecordingBackend } from './capture-backend'

/** User setup gaps — log locally and surface in UI, but not error monitoring noise. */
export function isExpectedRecordingConfigError(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('obs is not connected') ||
    lower.includes('obs not connected') ||
    lower.includes('obs not running') ||
    (lower.includes('obs') && lower.includes('websocket'))
  )
}

export function reportRecordingError(
  phase: 'start' | 'mid-match' | 'stop' | 'post-game',
  message: string,
  extra?: Record<string, unknown>,
): void {
  log.warn(`[Recording:${phase}] ${message}`, extra ?? {})
  if (isExpectedRecordingConfigError(message)) return
  reportError({
    message: `[Recording:${phase}] ${message}`,
    component: 'desktop:Recording',
    extra: { phase, ...extra },
  })
}

export function recordingBackendLabel(_backend: RecordingBackend): string {
  return 'OBS'
}
