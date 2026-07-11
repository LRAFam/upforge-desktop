/**
 * Renderer-process error reporter for the UpForge desktop app.
 * Captures Vue errors and unhandled JS errors in the renderer,
 * then POSTs them to the UpForge API for monitoring.
 *
 * Usage in components/composables:
 *   import { reportError } from '../lib/errorReporter'
 *   reportError({ message: 'Upload failed', component: 'PostGameView', extra: { jobId } })
 */

import type { App } from 'vue'
import { hasDesktopApi } from './desktop-api'

const API_URL = import.meta.env['VITE_API_URL'] || 'https://api.upforge.gg'
const ERROR_KEY = import.meta.env['VITE_ERROR_REPORTING_KEY'] || ''
const APP_VERSION = import.meta.env['VITE_APP_VERSION'] || ''

const reportedThisSession = new Set<string>()

export async function reportError(payload: {
  message: string
  stack?: string
  component?: string
  extra?: Record<string, unknown>
}): Promise<void> {
  const dedupeKey = `${payload.message}|${payload.component ?? ''}`
  if (reportedThisSession.has(dedupeKey)) return
  reportedThisSession.add(dedupeKey)

  let user: { id?: number; email?: string; name?: string } | null = null
  try {
    const result = await window.api?.auth?.getUser()
    user = result as { id?: number; email?: string; name?: string } | null
  } catch { /* not authenticated yet */ }

  const body = {
    platform: hasDesktopApi() ? 'desktop' : 'renderer',
    message: payload.message.slice(0, 1000),
    stack: payload.stack?.slice(0, 5000),
    component: payload.component,
    url: window.location.hash || window.location.pathname,
    app_version: APP_VERSION,
    user_id: user?.id,
    user_email: user?.email,
    user_name: user?.name,
    extra: payload.extra,
  }

  try {
    const response = await fetch(`${API_URL}/api/errors`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(ERROR_KEY ? { 'X-Error-Key': ERROR_KEY } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok && import.meta.env.DEV) {
      console.warn(
        `[ErrorReporter] API rejected report (${response.status})`,
      )
    }
  } catch { /* never throw from reporter */ }
}

export function setupRendererErrorReporter(app: App): void {
  // Vue component errors
  app.config.errorHandler = (err, instance, info) => {
    const error = err as Error
    reportError({
      message: error?.message || String(err),
      stack: error?.stack,
      component: (instance?.$options as { name?: string })?.name ?? info ?? undefined,
      extra: { vueInfo: info },
    })
    console.error('[Vue error]', err, info)
  }

  // Unhandled JS errors
  window.addEventListener('error', (event) => {
    if (event.target && (event.target as HTMLElement).tagName) return
    reportError({
      message: event.message || 'Unknown error',
      stack: event.error?.stack,
      component: event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : undefined,
    })
  })

  // Unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    if (!reason) return
    const message = reason instanceof Error ? reason.message : String(reason?.message || reason)
    if (message.includes('AbortError')) return
    if (/Object Not Found Matching Id/i.test(message)) return
    if (/ENOENT|Recording file not found/i.test(message)) return
    reportError({
      message: `Unhandled rejection: ${message}`,
      stack: reason instanceof Error ? reason.stack : undefined,
    })
  })

  // Intercept fetch to report API failures (4xx/5xx) from the renderer
  const originalFetch = window.fetch
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args)

    const url = typeof args[0] === 'string' ? args[0] : ((args[0] as Request)?.url ?? '')
    const isOurApi = url.startsWith(API_URL) || url.startsWith('https://api.upforge.gg')
    const isErrorEndpoint = url.includes('/api/errors')
    // 401/403 are expected access-control responses, not bugs
    const isExpectedAccessControl = response.status === 401 || response.status === 403

    if (isOurApi && !isErrorEndpoint && !isExpectedAccessControl && response.status >= 400) {
      const cloned = response.clone()
      let responseBody: string | undefined
      try {
        const json = await cloned.json()
        responseBody = json?.message || JSON.stringify(json)
      } catch {
        try { responseBody = await cloned.text() } catch { /* ignore */ }
      }

      try {
        const pathname = new URL(url).pathname
        reportError({
          message: `API ${response.status}: ${pathname}`,
          component: `fetch:${pathname}`,
          extra: { status: response.status, endpoint: pathname, response_body: responseBody?.slice(0, 500) },
        })
      } catch { /* ignore URL parse errors */ }
    }

    return response
  }
}
