/**
 * Product funnel event tracking — POST milestones to /api/funnel-events for admin analytics.
 */

import log from 'electron-log'
import type { AuthManager } from './auth-manager'

const SESSION_ID = `desktop-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

let authRef: AuthManager | null = null
let appVersion = 'unknown'

export function initFunnelEvents(auth: AuthManager, version: string): void {
  authRef = auth
  appVersion = version
}

export type FunnelEventName =
  | 'desktop_app_opened'
  | 'desktop_login'
  | 'desktop_onboarding_complete'
  | 'desktop_obs_connected'
  | 'desktop_first_recording'
  | 'desktop_first_analysis'
  | 'desktop_second_analysis'
  | 'upgrade_clicked'
  | 'account_linked'
  | 'match_detected'
  | 'recording_started'
  | 'recording_failed'
  | 'upload_started'
  | 'upload_failed'
  | 'ops_recording_lap'

export async function trackFunnelEvent(
  event: FunnelEventName,
  properties?: Record<string, unknown>,
): Promise<void> {
  const auth = authRef
  if (!auth?.getToken()) return

  try {
    await auth.getApi().post('/api/funnel-events', {
      event,
      channel: 'desktop',
      properties,
      session_id: SESSION_ID,
      app_version: appVersion,
    })
  } catch (err) {
    log.debug('[FunnelEvents] track failed (non-fatal):', event, err)
  }
}

export function trackAppOpened(): void {
  void trackFunnelEvent('desktop_app_opened')
}

export function trackLogin(): void {
  void trackFunnelEvent('desktop_login')
}

export function trackOnboardingComplete(): void {
  void trackFunnelEvent('desktop_onboarding_complete')
}

export function trackObsConnected(): void {
  void trackFunnelEvent('desktop_obs_connected')
}

export function trackFirstRecording(game?: string): void {
  void trackFunnelEvent('desktop_first_recording', game ? { game } : undefined)
}

export function trackFirstAnalysis(props?: Record<string, unknown>): void {
  void trackFunnelEvent('desktop_first_analysis', props)
}

export function trackSecondAnalysis(): void {
  void trackFunnelEvent('desktop_second_analysis')
}

// Note: `quota_limit_reached` is recorded server-side (DesktopSubmissionController)
// so it's captured for every client version, not just up-to-date desktop apps.

export function trackUpgradeClicked(source: string): void {
  void trackFunnelEvent('upgrade_clicked', { source })
}

export function trackMatchDetected(game = 'valorant'): void {
  void trackFunnelEvent('match_detected', { game })
}

export function trackRecordingStarted(game = 'valorant'): void {
  void trackFunnelEvent('recording_started', { game })
  // Keep legacy once-event for older admin queries during transition
  void trackFunnelEvent('desktop_first_recording', { game })
}

export function trackRecordingFailed(
  reason: string,
  phase: 'obs' | 'capture' | 'record',
  game = 'valorant',
): void {
  void trackFunnelEvent('recording_failed', {
    game,
    reason: reason.slice(0, 120),
    phase,
  })
}

export function trackUploadStarted(game = 'valorant'): void {
  void trackFunnelEvent('upload_started', { game })
}

export function trackUploadFailed(reason: string, game = 'valorant'): void {
  void trackFunnelEvent('upload_failed', {
    game,
    reason: reason.slice(0, 120),
  })
}

const ABS_PATH_RE = /(?:\/Users\/|[A-Za-z]:\\|\\\\)/

/** Drop path-like keys/values before cloud ops events. */
export function sanitizeOpsProperties(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(props)) {
    if (/path|dir|filepath|file_path/i.test(key) && key !== 'path_fallback') continue
    if (typeof value === 'string' && ABS_PATH_RE.test(value)) continue
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = sanitizeOpsProperties(value as Record<string, unknown>)
      continue
    }
    out[key] = value
  }
  return out
}

export function trackOpsRecordingLap(lap: Record<string, unknown>): void {
  const { event: _event, ...rest } = lap
  void trackFunnelEvent('ops_recording_lap', sanitizeOpsProperties(rest))
}

