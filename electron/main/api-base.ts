import { app } from 'electron'

/**
 * Shared API / web base URLs for main-process HTTP clients.
 *
 * VITE_API_URL / VITE_FRONTEND_URL are read at runtime, so in a packaged build
 * anyone who can set an environment variable could point the app (and the
 * user's bearer token) at their own server. Packaged builds therefore accept
 * an override only when it targets this machine (local stack testing).
 */

export const DEFAULT_API_BASE_URL = 'https://api.upforge.gg'
export const DEFAULT_FRONTEND_BASE_URL = 'https://upforge.gg'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

function isPackagedBuild(): boolean {
  try {
    return app?.isPackaged !== false
  } catch {
    // No Electron app object (worker / test mock) — assume packaged, the safe default.
    return true
  }
}

export function resolveBaseUrlOverride(raw: string | undefined, fallback: string, packaged: boolean): string {
  const value = raw?.trim()
  if (!value) return fallback
  if (packaged) {
    try {
      const url = new URL(value)
      if (!/^https?:$/.test(url.protocol) || !LOCAL_HOSTS.has(url.hostname.toLowerCase())) return fallback
    } catch {
      return fallback
    }
  }
  return value.replace(/\/$/, '')
}

export function getApiBaseUrl(): string {
  return resolveBaseUrlOverride(process.env['VITE_API_URL'], DEFAULT_API_BASE_URL, isPackagedBuild())
}

/** Web app base URL for opening coach dashboard / results in the browser. */
export function getFrontendBaseUrl(): string {
  return resolveBaseUrlOverride(process.env['VITE_FRONTEND_URL'], DEFAULT_FRONTEND_BASE_URL, isPackagedBuild())
}
