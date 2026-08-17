const WINDOWS_PATH = /\b[A-Za-z]:\\[^\r\n"'<>|]+/g
const POSIX_PRIVATE_PATH = /\/(?:Users|home|private\/var\/folders|var\/folders)\/[^\s"'<>]+/g
const URL_QUERY = /(https?:\/\/[^\s?]+)\?[^\s]+/gi
const SECRET = /\b(?:Bearer\s+|access[_-]?token[=:]\s*|token[=:]\s*)[^\s,;]+/gi

export function redactSensitiveString(value: string): string {
  return value
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
