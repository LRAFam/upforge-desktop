/** Retry time supplied by the API; null means it was not provided or was invalid. */
export function parseRetryAfter(value: string | undefined, now = Date.now()): number | null {
  if (!value?.trim()) return null
  if (/^\d+$/.test(value.trim())) {
    const deadline = now + Number(value) * 1000
    return Number.isFinite(deadline) && deadline <= 8.64e15 ? deadline : null
  }
  // HTTP dates start with a weekday; do not interpret malformed seconds as dates.
  if (!/^[A-Za-z]{3}/.test(value.trim())) return null
  const deadline = Date.parse(value)
  return Number.isFinite(deadline) ? Math.max(now, deadline) : null
}

export class UploadRateLimitError extends Error {
  readonly status = 429
  constructor(readonly retryAt: number | null) {
    super(retryAt === null
      ? 'Too many requests. The server did not provide a retry time. Please try again later.'
      : `Too many requests. Try again after ${new Date(retryAt).toLocaleTimeString()}.`)
    this.name = 'UploadRateLimitError'
  }
}

/** These POST routes share the API's desktop-submissions limiter. */
export function uploadRateLimitScope(url: string): string {
  const parsed = new URL(url)
  const shared = /^\/api\/desktop-submissions(?:\/(?:presign|complete|[^/]+\/duel-clips\/presign))?$/.test(parsed.pathname)
    || /^\/api\/recordings\/archive\/(?:presign|complete|[^/]+\/analyse)$/.test(parsed.pathname)
  return `${parsed.origin}${shared ? '/desktop-submissions-limit' : parsed.pathname}`
}
