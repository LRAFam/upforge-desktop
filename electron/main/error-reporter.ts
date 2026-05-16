/**
 * Error reporter for the Electron main process.
 * Captures uncaught exceptions and unhandled rejections,
 * then POSTs them to the UpForge API for monitoring.
 *
 * Also exports reportError() for manual reporting throughout the codebase.
 */

import { app } from 'electron'
import log from 'electron-log'
import type { AuthManager } from './auth-manager'

const API_URL = process.env['VITE_API_URL'] || 'https://api.upforge.gg'
const ERROR_KEY = process.env['VITE_ERROR_REPORTING_KEY'] || ''

// Session-level deduplication
const reportedThisSession = new Set<string>()

let _authManager: AuthManager | null = null

export function initErrorReporter(authManager: AuthManager): void {
  _authManager = authManager
}

export async function reportError(payload: {
  message: string
  stack?: string
  component?: string
  extra?: Record<string, unknown>
}): Promise<void> {
  const dedupeKey = `${payload.message}|${payload.component ?? ''}`
  if (reportedThisSession.has(dedupeKey)) return
  reportedThisSession.add(dedupeKey)

  const user = _authManager?.getUser() ?? null

  const body = {
    platform: 'desktop',
    message: payload.message.slice(0, 1000),
    stack: payload.stack?.slice(0, 5000),
    component: payload.component,
    app_version: app.getVersion(),
    user_id: user?.id,
    user_email: user?.email,
    user_name: user?.name,
    extra: {
      ...payload.extra,
      os: process.platform,
      arch: process.arch,
      electron: process.versions.electron,
      node: process.versions.node,
    },
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    await fetch(`${API_URL}/api/errors`, {
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
  } catch {
    // Never throw from error reporter
  }
}

export function setupMainProcessErrorHandlers(authManager: AuthManager): void {
  initErrorReporter(authManager)

  process.on('uncaughtException', (error: Error) => {
    log.error('[Main] Uncaught exception:', error)
    reportError({
      message: error.message,
      stack: error.stack,
      component: 'main:uncaughtException',
      extra: { fatal: true },
    })
  })

  process.on('unhandledRejection', (reason: unknown) => {
    const error = reason instanceof Error ? reason : new Error(String(reason))
    log.error('[Main] Unhandled rejection:', error)
    reportError({
      message: error.message,
      stack: error.stack,
      component: 'main:unhandledRejection',
    })
  })
}
