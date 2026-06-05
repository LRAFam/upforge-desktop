/**
 * Centralized recording error reporting for telemetry and user-facing messages.
 */

import log from 'electron-log'
import { reportError } from './error-reporter'
import type { RecordingBackend } from './capture-backend'

export function reportRecordingError(
  phase: 'start' | 'mid-match' | 'stop' | 'post-game',
  message: string,
  extra?: Record<string, unknown>,
): void {
  log.warn(`[Recording:${phase}] ${message}`, extra ?? {})
  reportError({
    message: `[Recording:${phase}] ${message}`,
    component: 'desktop:Recording',
    extra: { phase, ...extra },
  })
}

export function recordingBackendLabel(backend: RecordingBackend): string {
  return backend === 'obs' ? 'OBS' : backend === 'ffmpeg' ? 'ffmpeg' : 'desktop capture'
}
