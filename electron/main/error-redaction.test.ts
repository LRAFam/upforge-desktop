import { describe, expect, it } from 'vitest'
import { redactSensitiveString, redactSensitiveValue } from './error-redaction'

describe('error redaction', () => {
  it('removes local paths, URL queries, and bearer credentials', () => {
    const redacted = redactSensitiveString(
      'C:\\Users\\Adam Doe\\Videos\\match.mp4 https://example.test/a?token=secret Bearer abc123',
    )
    expect(redacted).not.toContain('Adam Doe')
    expect(redacted).not.toContain('token=secret')
    expect(redacted).not.toContain('abc123')
  })

  it('redacts nested diagnostic values', () => {
    expect(redactSensitiveValue({ sourcePath: '/Users/adam/Videos/match.mp4' }))
      .toEqual({ sourcePath: '[redacted-path]' })
  })
})
