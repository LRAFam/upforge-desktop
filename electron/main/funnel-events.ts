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
  | 'quota_limit_reached'
  | 'upgrade_clicked'

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

export function trackQuotaLimitReached(kind: 'analysis' | 'archive'): void {
  void trackFunnelEvent('quota_limit_reached', { kind })
}

export function trackUpgradeClicked(source: string): void {
  void trackFunnelEvent('upgrade_clicked', { source })
}
