import { redactSensitiveString } from './error-redaction'

function safeRequestDetail(value: string): string {
  return redactSensitiveString(value.replace(/https?:\/\/[^\s"'<>]+/gi, raw => {
    try { return new URL(raw).origin } catch { return '[redacted-url]' }
  })).slice(0, 1000)
}

/** These requests must not be replayed without reconciling their server-side outcome. */
export class UploadRequestError extends Error {
  readonly diagnostics: { stage: string; hostname: string; code: string; detail: string }

  constructor(message: string, url: string, stage: string, readonly code: string, detail: string) {
    const safeDetail = safeRequestDetail(detail)
    super(safeRequestDetail(message), { cause: new Error(safeDetail) })
    this.name = 'UploadRequestError'
    this.diagnostics = { stage, hostname: new URL(url).hostname, code, detail: safeDetail }
  }
}

export function apiRequestStage(url: string): string {
  return new URL(url).pathname.split('/').pop() || 'api'
}

export function apiRequestTimeout(url: string): UploadRequestError {
  const stage = apiRequestStage(url)
  return new UploadRequestError(
    `API request timed out during ${stage} (${new URL(url).hostname}). Your recording is still saved.`,
    url, stage, 'ETIMEDOUT', 'API request timed out after 30 seconds without activity',
  )
}

/** Keep TLS verification enabled and identify the failing host without exposing signed URLs. */
export function annotateTlsFailure(error: unknown, url: string, stage: string): unknown {
  if (error instanceof UploadRequestError) return error
  const message = error instanceof Error ? error.message : String(error)
  const code = String((error as NodeJS.ErrnoException | null)?.code ?? '')
  if (!/EPROTO|ERR_SSL|ERR_TLS|CERT_|certificate|SSL.*handshake/i.test(`${code} ${message}`)) return error
  return new UploadRequestError(
    `Secure connection failed during ${stage} (${new URL(url).hostname}; ${code || 'TLS'}). Check your connection or VPN/proxy settings, then try again. Your recording is still saved.`,
    url, stage, code || 'TLS', message,
  )
}

export function isAmbiguousApiPostError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  const code = String((error as NodeJS.ErrnoException | null)?.code ?? '')
  const status = (error as { statusCode?: number } | null)?.statusCode
  return error instanceof UploadRequestError
    || (status !== undefined && status >= 500)
    || /timed out|socket hang up|ECONNRESET|ECONNABORTED|ETIMEDOUT|EPIPE|ERR_STREAM_PREMATURE_CLOSE|network|HTTP 5\d\d|Request failed \(5\d\d\)|Unexpected server response \(HTTP 2\d\d\)|already completed/i.test(`${code} ${message}`)
}
