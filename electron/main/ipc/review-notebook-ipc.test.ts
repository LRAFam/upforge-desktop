import { describe, expect, it, vi } from 'vitest'
import { setupReviewNotebookHandlers } from './review-notebook-ipc'
import type { IpcMain } from 'electron'
import type { AuthManager } from '../auth-manager'

function setup() {
  const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>()
  let owner: number | null = 1
  const get = vi.fn().mockResolvedValue({ data: { items: [] } })
  const remove = vi.fn().mockResolvedValue({ data: { deleted: true } })
  const put = vi.fn().mockResolvedValue({ data: { revision: 1 } })
  setupReviewNotebookHandlers({ handle: (name: string, handler: (...args: unknown[]) => Promise<unknown>) => handlers.set(name, handler) } as unknown as IpcMain,
    { getToken: () => owner ? `token-${owner}` : null, getUser: () => owner ? { id: owner } : null, getApi: () => ({ get, put, delete: remove }) } as unknown as AuthManager)
  return { handlers, get, put, remove, setOwner: (id: number | null) => { owner = id } }
}
describe('account notebook bridge', () => {
  it('does not send requests while signed out', async () => {
    const s = setup(); s.setOwner(null)
    expect(await s.handlers.get('review-notebook:list')!()).toMatchObject({ ok: false })
    expect(s.get).not.toHaveBeenCalled()
  })
  it('discards a response after an account switch', async () => {
    const s = setup()
    s.get.mockImplementation(async () => { s.setOwner(2); return { data: { items: ['private'] } } })
    const result = await s.handlers.get('review-notebook:list')!()
    expect(result).toMatchObject({ ok: false })
    expect(JSON.stringify(result)).not.toContain('private')
  })
  it('sends revision-checked deletion and suppresses results after account changes', async () => {
    const s = setup()
    const id = '11111111-1111-4111-8111-111111111111'
    expect(await s.handlers.get('review-notebook:remove')!({}, id, 3)).toMatchObject({ ok: true })
    expect(s.remove).toHaveBeenCalledExactlyOnceWith(`/api/review-notebook/${id}`, { data: { revision: 3 } })
    s.remove.mockImplementation(async () => { s.setOwner(2); return { data: { deleted: true } } })
    expect(await s.handlers.get('review-notebook:remove')!({}, id, 3)).toMatchObject({ ok: false })
  })
  it('sends versioned writes and reports conflicts without retrying', async () => {
    const s = setup(); s.put.mockRejectedValue({ response: { status: 409 } })
    const result = await s.handlers.get('review-notebook:save')!({}, '11111111-1111-4111-8111-111111111111', { revision: 4 })
    expect(s.put).toHaveBeenCalledExactlyOnceWith('/api/review-notebook/11111111-1111-4111-8111-111111111111', { revision: 4 })
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('another device') })
  })
})

it('workspace coach preserves request IDs and reports server usage limits', async () => {
  const handlers = new Map<string, (...args: any[]) => Promise<any>>()
  const post = vi.fn().mockResolvedValue({ data: { id: 'same-request', status: 'queued' } })
  setupReviewNotebookHandlers({ handle: (name: string, callback: any) => handlers.set(name, callback) } as unknown as IpcMain,
    { getToken: () => 'local-fixture', getUser: () => ({ id: 1 }), getApi: () => ({ post }) } as unknown as AuthManager)
  const body = { id: 'same-request', message: 'Compare these', moments: [] }
  expect(await handlers.get('workspace-coach:ask')!({}, 639, body)).toMatchObject({ ok: true })
  expect(post).toHaveBeenCalledWith('/api/analyses/639/chat/workspace', body)
  post.mockRejectedValue({ response: { status: 429, data: { message: 'Included questions used.' } } })
  expect(await handlers.get('workspace-coach:ask')!({}, 639, body)).toEqual({ ok: false, error: 'Included questions used.' })
})

it('personal review sends scoped requests and drops responses after account changes', async () => {
  const s = setup()
  const source = { kind: 'recording', id: 'local-123', game: 'valorant' }
  expect(await s.handlers.get('personal-review:get')!({}, source)).toMatchObject({ ok: true })
  expect(s.get).toHaveBeenCalledWith('/api/personal-review', { params: { source } })
  s.put.mockImplementation(async () => { s.setOwner(2); return { data: { focus: 'private' } } })
  const result = await s.handlers.get('personal-review:save')!({}, { source, revision: 1 })
  expect(result).toMatchObject({ ok: false })
  expect(JSON.stringify(result)).not.toContain('private')
  s.setOwner(null)
  expect(await s.handlers.get('personal-review:get')!({}, source)).toMatchObject({ ok: false })
})
