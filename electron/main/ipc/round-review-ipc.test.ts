import { describe, expect, it, vi } from 'vitest'
vi.mock('electron', () => ({}))
vi.mock('../renderer-trust', () => ({ isTrustedRendererUrl: (url: string) => url === 'app://trusted' }))
import { setupRoundReviewHandlers } from './round-review-ipc'
import type { IpcMain } from 'electron'
import type { AuthManager } from '../auth-manager'

const review = { id: 1, round_number: 3 }
function fixture(signedIn = true) {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const get = vi.fn(async (url: string) => ({ data: url.endsWith('/allowance') ? { remaining: 2 } : url.endsWith('/round-reviews') ? { reviews: [review], allowance: { remaining: 2 } } : { review } }))
  const post = vi.fn(async () => ({ data: { review, charged: true, allowance: { remaining: 1 } } }))
  const auth = { isAuthenticated: () => signedIn, getApi: vi.fn(() => ({ get, post })) }
  setupRoundReviewHandlers({ handle: (name: string, fn: (...args: unknown[]) => unknown) => handlers.set(name, fn) } as unknown as IpcMain, auth as unknown as AuthManager)
  const call = (channel: string, url: string | null = 'app://trusted') =>
    handlers.get(channel)!(url === null ? {} : { senderFrame: { url } }, 'job1', 3)
  return { call, get, post, auth }
}
const channels = ['round-review:allowance', 'round-review:list', 'round-review:get', 'round-review:request']

describe('round review IPC', () => {
  it.each(channels)('%s refuses untrusted frames', async (channel) => {
    const f = fixture()
    expect(await f.call(channel, 'https://evil.example')).toEqual({ ok: false, error: 'Untrusted request' })
    expect(await f.call(channel, null)).toEqual({ ok: false, error: 'Untrusted request' })
    expect(f.auth.getApi).not.toHaveBeenCalled()
    expect(f.get).not.toHaveBeenCalled()
    expect(f.post).not.toHaveBeenCalled()
  })
  it.each(channels)('%s refuses signed-out users', async (channel) => {
    const f = fixture(false)
    expect(await f.call(channel)).toEqual({ ok: false, error: 'Not signed in' })
    expect(f.auth.getApi).not.toHaveBeenCalled()
    expect(f.get).not.toHaveBeenCalled()
    expect(f.post).not.toHaveBeenCalled()
  })
  it('lets trusted, signed-in calls reach the API', async () => {
    const f = fixture()
    expect(await f.call('round-review:allowance')).toEqual({ ok: true, allowance: { remaining: 2 } })
    expect(await f.call('round-review:list')).toEqual({ ok: true, reviews: [review], allowance: { remaining: 2 } })
    expect(await f.call('round-review:get')).toEqual({ ok: true, review })
    expect(await f.call('round-review:request')).toEqual({ ok: true, review, charged: true, allowance: { remaining: 1 } })
    expect(f.get).toHaveBeenCalledWith('/api/round-reviews/allowance')
    expect(f.get).toHaveBeenCalledWith('/api/analysis-jobs/job1/round-reviews')
    expect(f.get).toHaveBeenCalledWith('/api/analysis-jobs/job1/rounds/3/review')
    expect(f.post).toHaveBeenCalledWith('/api/analysis-jobs/job1/rounds/3/review')
  })
})
