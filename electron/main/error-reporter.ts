import { APP_VERSION } from './app-version'
/**
 * Error reporter for the Electron main process.
 * Captures uncaught exceptions and unhandled rejections,
 * then POSTs them to the UpForge API for monitoring.
 *
 * Also exports reportError() for manual reporting throughout the codebase.
 */

import { app } from 'electron'
import log from 'electron-log'
import { showAppNotification } from './app-notifications'
import type { AuthManager } from './auth-manager'
import { isBenignObsWebSocketError } from './obs-errors'
import { redactSensitiveString, redactSensitiveValue } from './error-redaction'
import { recentErrorActivity } from './error-activity'
import { ERROR_REPORTING_KEY } from './error-reporting-key'
import { getApiBaseUrl } from './api-base'

const API_URL = getApiBaseUrl()
const ERROR_KEY = ERROR_REPORTING_KEY

// Session-level deduplication
const reportedThisSession = new Set<string>()

let _authManager: AuthManager | null = null

export function initErrorReporter(authManager: AuthManager): void {
  _authManager = authManager
}

function reportingDisabled(): boolean {
  // Packaged self-tests (CI) must never post to the production API.
  return process.env['UPFORGE_SELFTEST'] === '1'
}

async function postReport(body: Record<string, unknown>): Promise<void> {
  if (reportingDisabled()) return
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const response = await fetch(`${API_URL}/api/errors`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(ERROR_KEY ? { 'X-Error-Key': ERROR_KEY } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!response.ok) {
      log.warn(
        `[ErrorReporter] API rejected report (${response.status}) — ` +
        `${ERROR_KEY ? 'check ERROR_REPORTING_KEY' : 'VITE_ERROR_REPORTING_KEY missing at build time'}`,
      )
    }
  } catch (err) {
    log.debug('[ErrorReporter] Failed to POST error report:', err)
  }
}

/**
 * Low-volume diagnostics (e.g. `[MainLag]`). Unlike reportError it sends no user id/email/name
 * and skips session dedupe: callers rate-limit (see diagnostic-reporter.ts).
 */
export async function reportDiagnostic(payload: {
  message: string
  component: string
  extra: Record<string, unknown>
}): Promise<void> {
  await postReport({
    platform: 'desktop',
    message: redactSensitiveString(payload.message).slice(0, 1000),
    component: payload.component.slice(0, 255),
    app_version: APP_VERSION,
    extra: {
      ...(redactSensitiveValue(payload.extra) as Record<string, unknown>),
      electron: process.versions.electron,
    },
  })
}

export async function reportError(payload: {
  message: string
  stack?: string
  component?: string
  extra?: Record<string, unknown>
}): Promise<void> {
  const safeMessage = redactSensitiveString(payload.message)
  const dedupeKey = `${safeMessage}|${payload.component ?? ''}`
  if (reportedThisSession.has(dedupeKey)) return
  reportedThisSession.add(dedupeKey)

  const user = _authManager?.getUser() ?? null

  const body = {
    platform: 'desktop',
    message: safeMessage.slice(0, 1000),
    stack: payload.stack ? redactSensitiveString(payload.stack).slice(0, 5000) : undefined,
    component: payload.component,
    app_version: APP_VERSION,
    user_id: user?.id,
    user_email: user?.email,
    user_name: user?.name,
    extra: {
      ...(redactSensitiveValue(payload.extra) as Record<string, unknown> | undefined),
      recent_activity: recentErrorActivity(),
      os: process.platform,
      arch: process.arch,
      electron: process.versions.electron,
      node: process.versions.node,
    },
  }

  await postReport(body)
}

export function setupMainProcessErrorHandlers(authManager: AuthManager): void {
  initErrorReporter(authManager)

  process.on('uncaughtException', (error: Error) => {
    log.error('[Main] Uncaught exception:', error)

    const isNoSpace = (error as NodeJS.ErrnoException).code === 'ENOSPC'
    if (isNoSpace) {
      // Show a user-facing notification for disk-full errors
      try {
        showAppNotification({
          title: 'UpForge — Disk Full',
          body: 'Your disk is full. Please free up space or recordings may not save correctly.',
          silent: true,
        })
      } catch { /* notifications not available */ }
    }

    reportError({
      message: error.message,
      stack: error.stack,
      component: 'main:uncaughtException',
      extra: { fatal: true },
    })
  })

  process.on('unhandledRejection', (reason: unknown) => {
    const error = reason instanceof Error ? reason : new Error(String(reason))
    if (isBenignObsWebSocketError(error)) {
      log.debug('[Main] Ignoring benign OBS WebSocket rejection:', error.message)
      return
    }
    // electron-updater can reject before latest.yml is uploaded to a new GitHub release
    if (
      (/latest\.yml/i.test(error.message) || /UpForge-Setup-.*\.exe/i.test(error.message))
      && /404|not found|cannot find|httperror|cannot download/i.test(error.message)
    ) {
      log.warn('[Main] Ignoring transient updater rejection:', error.message)
      return
    }
    log.error('[Main] Unhandled rejection:', error)
    reportError({
      message: error.message,
      stack: error.stack,
      component: 'main:unhandledRejection',
    })
  })
}
