import log from 'electron-log'
import { app } from 'electron'
import type { AuthManager } from './auth-manager'

let lastPingedUserId: number | null = null

/**
 * Notify API that the desktop app launched while authenticated (once per user session).
 */
export async function pingDesktopOnboarding(auth: AuthManager): Promise<void> {
  if (!auth.isAuthenticated()) return

  const user = auth.getUser()
  if (!user?.id || lastPingedUserId === user.id) return

  try {
    const version = app.getVersion()
    await auth.getApi().post('/api/onboarding/desktop-ping', { app_version: version })
    lastPingedUserId = user.id
    log.info('[Onboarding] Desktop launch pinged for user', user.id)
  } catch (err) {
    log.warn('[Onboarding] Desktop launch ping failed:', err)
  }
}

export function resetDesktopOnboardingPing(): void {
  lastPingedUserId = null
}
