const WINDOWS_PATH = /\b[A-Za-z]:\\[^\r\n"'<>|]+/g
const POSIX_PRIVATE_PATH = /\/(?:Users|home|private\/var\/folders|var\/folders)\/[^\r\n"'<>]+/g
const URL_QUERY = /(https?:\/\/[^\s?]+)\?[^\s]+/gi
const SECRET = /\b(?:Bearer\s+|access[_-]?token[=:]\s*|token[=:]\s*)[^\s,;]+/gi
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
const NAMED_SECRET = /["']?\b(?:password|authorization|(?:access[_-]?|refresh[_-]?)?token|api[_-]?key|secret)["']?\s*[:=]\s*(?:"[^"\r\n]*"|'[^'\r\n]*'|Bearer\s+[^\s,;]+|[^\s,;]+)/gi

export function redactSensitiveString(value: string): string {
  return value
    .replace(NAMED_SECRET, '[redacted-secret]')
    .replace(EMAIL, '[redacted-email]')
    .replace(URL_QUERY, '$1?[redacted]')
    .replace(WINDOWS_PATH, '[redacted-path]')
    .replace(POSIX_PRIVATE_PATH, '[redacted-path]')
    .replace(SECRET, '[redacted-secret]')
}

export function redactSensitiveValue(value: unknown): unknown {
  if (typeof value === 'string') return redactSensitiveString(value)
  if (Array.isArray(value)) return value.map(redactSensitiveValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([key, nested]) => [key, redactSensitiveValue(nested)]),
    )
  }
  return value
}
