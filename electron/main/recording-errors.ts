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
    (lower.includes('obs') && lower.includes('websocket')) ||
    lower.includes('already recording') ||
    lower.includes('did not become active') ||
    lower.includes('obs process exited')
  )
}

export function reportRecordingError(
  phase: 'start' | 'mid-match' | 'stop' | 'post-game',
  error: unknown,
  extra?: Record<string, unknown>,
): void {
  const message = error instanceof Error ? error.message : String(error)
  log.warn(`[Recording:${phase}] ${message}`, extra ?? {})
  if (isExpectedRecordingConfigError(message)) return
  reportError({
    message: `[Recording:${phase}] ${message}`,
    stack: error instanceof Error ? error.stack : undefined,
    component: 'desktop:Recording',
    extra: { phase, ...extra },
  })
}

export function recordingBackendLabel(_backend: RecordingBackend): string {
  return 'OBS'
}
