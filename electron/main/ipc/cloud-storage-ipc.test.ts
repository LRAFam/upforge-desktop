import { expect, it, vi } from 'vitest'
import { shell, type IpcMain } from 'electron'
vi.mock('electron', () => ({ shell: { openExternal: vi.fn() } }))
import type { AuthManager } from '../auth-manager'
import { setupCloudStorageHandlers } from './cloud-storage-ipc'
it('validates input, requires sign-in and drops data when the account changes', async () => {
  let handler: (...args: any[]) => Promise<any> = async () => null
  let owner: number | null = null
  const get = vi.fn().mockResolvedValue({ data: { items: [] } })
  setupCloudStorageHandlers({ handle: (_name: string, fn: typeof handler) => { handler = fn } } as unknown as IpcMain, { getToken: () => owner ? `token-${owner}` : null, getUser: () => owner ? { id: owner } : null, getApi: () => ({ get }) } as unknown as AuthManager)
  const query = { kind: 'all', sort: 'newest', page: 1 }
  expect(await handler({}, query)).toMatchObject({ ok: false }); expect(get).not.toHaveBeenCalled()
  owner = 1
  expect(await handler({}, { ...query, page: -1 })).toMatchObject({ ok: false }); expect(get).not.toHaveBeenCalled()
  expect(await handler({}, query)).toMatchObject({ ok: true })
  expect(get).toHaveBeenCalledWith('/api/account/cloud-storage', { params: query })
  get.mockImplementation(async () => { owner = 2; return { data: 'private file list' } })
  const result = await handler({}, query)
  expect(result.ok).toBe(false); expect(JSON.stringify(result)).not.toContain('private file list')
})

it('opens only authenticated cloud IDs, rejects unsafe URLs and explains expired footage', async () => {
  const handlers: Record<string, (...args: any[]) => Promise<any>> = {}
  let owner = 1
  const get = vi.fn().mockResolvedValue({ data: { video_url: 'https://media.example/clip.mp4' } })
  setupCloudStorageHandlers({ handle: (name: string, fn: typeof handlers[string]) => { handlers[name] = fn } } as unknown as IpcMain, { getToken: () => `token-${owner}`, getUser: () => ({ id: owner }), getApi: () => ({ get }) } as unknown as AuthManager)
  const file = { kind: 'clip', id: '12' }
  expect(await handlers['cloud-storage:playback']({}, { ...file, id: '../12' })).toMatchObject({ ok: false })
  expect(get).not.toHaveBeenCalled()
  expect(await handlers['cloud-storage:playback']({}, file)).toEqual({ ok: true, url: 'https://media.example/clip.mp4' })
  expect(get).toHaveBeenCalledWith('/api/clips/12/video')
  const downloadURL = vi.fn()
  expect(await handlers['cloud-storage:download']({ sender: { downloadURL } }, file)).toEqual({ ok: true })
  expect(downloadURL).toHaveBeenCalledWith('https://media.example/clip.mp4')
  get.mockResolvedValue({ data: { video_url: 'file:///private/file' } })
  expect(await handlers['cloud-storage:playback']({}, file)).toMatchObject({ ok: false })
  get.mockRejectedValue({ response: { status: 410 } })
  expect(await handlers['cloud-storage:playback']({}, { kind: 'recording', id: '12345678-1234-1234-1234-123456789abc' })).toMatchObject({ ok: false, error: expect.stringContaining('Upgrading does not restore') })
  get.mockImplementation(async () => { owner = 2; return { data: { video_url: 'https://media.example/private.mp4' } } })
  const result = await handlers['cloud-storage:playback']({}, file)
  expect(result.ok).toBe(false)
  expect(JSON.stringify(result)).not.toContain('private.mp4')
})

it('opens only verified Stripe checkout addresses and never opens them after account changes', async () => {
  vi.mocked(shell.openExternal).mockClear()
  const handlers: Record<string, (...args: any[]) => Promise<any>> = {}
  let owner = 1
  const post = vi.fn().mockResolvedValue({ data: { checkout_url: 'https://checkout.stripe.com/c/pay/test' } })
  setupCloudStorageHandlers({ handle: (name: string, fn: typeof handlers[string]) => { handlers[name] = fn } } as unknown as IpcMain, { getToken: () => `token-${owner}`, getUser: () => ({ id: owner }), getApi: () => ({ post }) } as unknown as AuthManager)
  const purchase = (gb = 50) => handlers['storage-addon:request']({}, { action: 'checkout', gb })
  expect(await purchase(51)).toMatchObject({ ok: false })
  expect(post).not.toHaveBeenCalled()
  expect(await purchase()).toMatchObject({ ok: true })
  expect(shell.openExternal).toHaveBeenCalledTimes(1)
  for (const checkout_url of ['https://checkout.stripe.com.evil.test/pay', 'https://user@checkout.stripe.com/pay', 'file:///tmp/pay', undefined]) {
    post.mockResolvedValue({ data: { checkout_url } })
    expect(await purchase()).toMatchObject({ ok: false })
  }
  expect(shell.openExternal).toHaveBeenCalledTimes(1)
  post.mockImplementation(async () => { owner = 2; return { data: { checkout_url: 'https://checkout.stripe.com/c/pay/private' } } })
  expect(await purchase()).toMatchObject({ ok: false })
  expect(shell.openExternal).toHaveBeenCalledTimes(1)
})

it('distinguishes unavailable storage rollout from a retryable network error', async () => {
  const handlers: Record<string, (...args: any[]) => Promise<any>> = {}
  const get = vi.fn().mockRejectedValue({ response: { status: 404 } })
  setupCloudStorageHandlers({ handle: (name: string, fn: typeof handlers[string]) => { handlers[name] = fn } } as unknown as IpcMain, { getToken: () => 'token', getUser: () => ({ id: 1 }), getApi: () => ({ get }) } as unknown as AuthManager)
  expect(await handlers['storage-addon:request']({}, { action: 'show' })).toMatchObject({ ok: false, unavailable: true })
  get.mockRejectedValue(new Error('Offline'))
  expect(await handlers['storage-addon:request']({}, { action: 'show' })).toMatchObject({ ok: false, unavailable: false })
})

it('requests cloud coaching on the existing clip and withholds responses after an account change', async () => {
  const handlers: Record<string, (...args: any[]) => Promise<any>> = {}
  let owner = 1
  const data = { clip: { id: 12, video_url: 'https://media.example/clip.mp4', trigger: 'kill', duration_seconds: 20, created_at: '2026-09-29T10:00:00Z' }, quota: { limit: 10, used: 1, remaining: 9 } }
  const get = vi.fn().mockResolvedValue({ data }), post = vi.fn().mockResolvedValue({})
  setupCloudStorageHandlers({ handle: (name: string, fn: typeof handlers[string]) => { handlers[name] = fn } } as unknown as IpcMain, { getToken: () => `token-${owner}`, getUser: () => ({ id: owner }), getApi: () => ({ get, post }) } as unknown as AuthManager)
  const review = handlers['cloud-clip:review']
  expect(await review({}, -1, true)).toMatchObject({ ok: false })
  expect(post).not.toHaveBeenCalled()
  expect(await review({}, 12, true)).toMatchObject({ ok: true })
  expect(post).toHaveBeenCalledWith('/api/clips/12/analyse', {})
  post.mockRejectedValueOnce({ response: { status: 402, data: { message: 'Allowance used' } } })
  expect(await review({}, 12, true)).toMatchObject({ ok: false, needsUpgrade: true })
  get.mockClear()
  post.mockImplementation(async () => { owner = 2; return {} })
  expect(await review({}, 12, true)).toMatchObject({ ok: false })
  expect(get).not.toHaveBeenCalled()
})

it('validates the confirmed allowance without opening another checkout', async () => {
  const handlers: Record<string, (...args: any[]) => Promise<any>> = {}
  const post = vi.fn().mockResolvedValue({ data: { usage: { active: true, capacity_bytes: 50e9, used_bytes: 0, reserved_bytes: 0, remaining_bytes: 50e9, paid_until: null, grace_until: null, cancel_at_period_end: false, status: 'active' }, packs: [{ gb: 50, cents: 499, available: true }], grace_days: 14 } })
  setupCloudStorageHandlers({ handle: (name: string, fn: typeof handlers[string]) => { handlers[name] = fn } } as unknown as IpcMain, { getToken: () => 'token', getUser: () => ({ id: 1 }), getApi: () => ({ post }) } as unknown as AuthManager)
  const result = await handlers['storage-addon:request']({}, { action: 'sync' })
  expect(result).toMatchObject({ ok: true, data: { usage: { capacity_bytes: 50e9 } } })
  expect(post).toHaveBeenCalledWith('/api/account/storage-addon/sync', {})
  post.mockResolvedValue({ data: { success: true } })
  expect(await handlers['storage-addon:request']({}, { action: 'sync' })).toMatchObject({ ok: false })
})
