import { afterEach, describe, expect, it, vi } from 'vitest'
import http from 'http'
import os from 'os'
import type { AuthManager } from './auth-manager'
vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir(), getAppPath: () => os.tmpdir(), isPackaged: false } }))
import { UploadManager } from './upload-manager'
import { parseRetryAfter, UploadRateLimitError } from './upload-rate-limit'

afterEach(() => vi.restoreAllMocks())

describe('upload rate limits', () => {
  it('parses seconds and HTTP dates without inventing missing cooldowns', () => {
    const now = Date.parse('2026-09-21T12:00:00Z')
    expect(parseRetryAfter('60', now)).toBe(now + 60_000)
    expect(parseRetryAfter('Mon, 21 Sep 2026 12:01:00 GMT', now)).toBe(now + 60_000)
    expect(parseRetryAfter(undefined, now)).toBeNull()
    expect(parseRetryAfter('invalid', now)).toBeNull()
    expect(parseRetryAfter('-1', now)).toBeNull()
    expect(parseRetryAfter('1.5', now)).toBeNull()
    expect(parseRetryAfter('999999999999999999999', now)).toBeNull()
  })

  it('blocks shared-bucket retries until expiry, but isolates accounts and unrelated routes', async () => {
    let requests = 0
    const server = http.createServer((_req, res) => {
      requests++
      if (requests === 1) {
        res.writeHead(429, { 'Retry-After': '60' })
        res.end('non-JSON rate limit')
      } else { res.end('{}') }
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    try {
      const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
      const manager = new UploadManager({} as AuthManager) as unknown as {
        _apiPost: (url: string, body: string, token: string) => Promise<unknown>
      }
      const post = (route: string, token = 'account-a') => manager._apiPost(origin + route, '{}', token)
      const now = Date.now()
      vi.spyOn(Date, 'now').mockReturnValue(now)
      await expect(post('/api/desktop-submissions/presign')).rejects.toMatchObject({ status: 429, retryAt: now + 60_000 })
      await expect(post('/api/recordings/archive/presign')).rejects.toBeInstanceOf(UploadRateLimitError)
      await expect(post('/api/desktop-submissions/job/duel-clips/presign')).rejects.toBeInstanceOf(UploadRateLimitError)
      expect(requests).toBe(1)
      await post('/api/desktop-submissions/presign', 'account-b')
      await post('/api/desktop-submissions/job/retry')
      expect(requests).toBe(3)
      vi.mocked(Date.now).mockReturnValue(now + 60_001)
      await post('/api/desktop-submissions/complete')
      expect(requests).toBe(4)
    } finally {
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })
})
