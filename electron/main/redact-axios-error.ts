/**
 * Axios errors carry the request config and the raw Node request, both of which hold the
 * `Authorization: Bearer …` header. Handlers that rethrow them get printed in full by Electron
 * ("Error occurred in handler for …") and by log.error, which leaked the session token into logs.
 * This keeps what callers use (message, code, status, response data/headers) and drops the rest.
 */
export interface RedactedHttpError extends Error {
  isAxiosError: true
  code?: string
  status?: number
  response?: { status: number; statusText?: string; data: unknown; headers?: Record<string, unknown> }
  config?: { method?: string; url?: string; baseURL?: string }
}

type MaybeAxiosError = {
  message?: unknown
  name?: unknown
  code?: unknown
  stack?: unknown
  config?: { method?: unknown; url?: unknown; baseURL?: unknown }
  response?: { status?: unknown; statusText?: unknown; data?: unknown; headers?: unknown }
}

const str = (v: unknown) => (typeof v === 'string' ? v : undefined)

export function redactAxiosError(err: unknown): unknown {
  if (!err || typeof err !== 'object') return err
  const e = err as MaybeAxiosError
  if (!('config' in e) && !('request' in e)) return err
  const out = new Error(str(e.message) ?? 'Request failed') as RedactedHttpError
  out.name = str(e.name) ?? 'AxiosError'
  out.isAxiosError = true
  out.code = str(e.code)
  if (e.config) out.config = { method: str(e.config.method), url: str(e.config.url), baseURL: str(e.config.baseURL) }
  if (e.response && typeof e.response.status === 'number') {
    out.status = e.response.status
    const headers = e.response.headers && typeof e.response.headers === 'object'
      ? { ...(e.response.headers as Record<string, unknown>) }
      : undefined
    if (headers) for (const k of Object.keys(headers)) if (/^(authorization|set-cookie|cookie)$/i.test(k)) delete headers[k]
    out.response = { status: e.response.status, statusText: str(e.response.statusText), data: e.response.data, headers }
  }
  return out
}
