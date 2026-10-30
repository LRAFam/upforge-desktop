import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' }, safeStorage: { isEncryptionAvailable: () => false } }))
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { sessionRejected } from './auth-manager'

describe('sessionRejected', () => {
  it('signs out only when the server rejects the token', () => {
    expect(sessionRejected(401)).toBe(true)
    expect(sessionRejected(403)).toBe(true)
  })
  it('keeps the session on timeouts, network errors and server errors', () => {
    expect(sessionRejected(undefined)).toBe(false)
    expect(sessionRejected(500)).toBe(false)
    expect(sessionRejected(503)).toBe(false)
    expect(sessionRejected(429)).toBe(false)
  })
})
