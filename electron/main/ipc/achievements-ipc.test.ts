import { describe, expect, it, vi } from 'vitest'
import type { IpcMain } from 'electron'
import type { AuthManager } from '../auth-manager'
vi.mock('../renderer-trust', () => ({ isTrustedRendererUrl: (url: string) => url === 'app://trusted' }))
import { setupAchievementHandlers } from './achievements-ipc'

const early = '2026-11-01T00:00:00.000Z'
const late = '2026-11-20T00:00:00.000Z'
const reply = (list: Record<string, string>) => ({ data: { achievements: Object.entries(list).map(([id, unlocked_at]) => ({ id, unlocked_at })) } })
function fixture() {
  let user = 7, token = 'token-seven'
  const get = vi.fn(async () => reply({}))
  const post = vi.fn(async (_path: string, body: { achievements: Array<{ id: string; unlocked_at: string }> }) => ({ data: body }))
  const auth = { getUser: () => ({ id: user }), getToken: () => token, getApi: () => ({ get, post }) }
  const handlers = new Map<string, (...args: any[]) => any>()
  setupAchievementHandlers({ handle: (name: string, handler: (...args: any[]) => any) => handlers.set(name, handler) } as unknown as IpcMain, auth as unknown as AuthManager)
  const frame = { url: 'app://trusted' }
  const event = { senderFrame: frame, sender: { mainFrame: frame } }
  return { get, post, event, switchAccount: () => { user = 8; token = 'token-eight' },
    sync: (list: unknown = {}, owner = 7, e = event) => handlers.get('achievements:sync')!(e, owner, list) }
}

describe('account achievement API transport', () => {
  it('merges both directions, uploads only missing/earlier local dates and pins auth headers', async () => {
    const f = fixture()
    f.get.mockResolvedValue(reply({ 'score-90': late, 'streak-3': early }))
    expect(await f.sync({ 'score-90': early, 'first-drill': late })).toEqual({ 'score-90': early, 'streak-3': early, 'first-drill': late })
    expect(f.get).toHaveBeenCalledWith('/api/achievements', { headers: { Authorization: 'Bearer token-seven' } })
    expect(f.post).toHaveBeenCalledWith('/api/achievements', { achievements: [
      { id: 'score-90', unlocked_at: early }, { id: 'first-drill', unlocked_at: late },
    ] }, { headers: { Authorization: 'Bearer token-seven' } })
  })
  it('does not write already synchronized unlocks', async () => {
    const f = fixture(); f.get.mockResolvedValue(reply({ 'score-90': early }))
    expect(await f.sync({ 'score-90': late })).toEqual({ 'score-90': early })
    expect(f.post).not.toHaveBeenCalled()
  })
  it('refuses stale accounts, subframes and untrusted pages before requests', async () => {
    const f = fixture()
    expect(await f.sync({}, 8)).toBeNull()
    expect(await f.sync({}, 7, { ...f.event, senderFrame: { url: 'app://trusted' } })).toBeNull()
    f.event.senderFrame.url = 'https://evil.example'
    expect(await f.sync()).toBeNull()
    expect(f.get).not.toHaveBeenCalled()
  })
  it('does not post after an account switch while loading server unlocks', async () => {
    const f = fixture()
    f.get.mockImplementation(async () => { f.switchAccount(); return reply({}) })
    expect(await f.sync({ 'score-90': early })).toBeNull()
    expect(f.post).not.toHaveBeenCalled()
  })
  it('ignores an old POST reply after logout or account switch', async () => {
    const f = fixture()
    f.post.mockImplementation(async () => { f.switchAccount(); return reply({ 'score-90': early }) })
    expect(await f.sync({ 'score-90': early })).toBeNull()
  })
  it('returns an unsynced result on network/malformed replies and can retry later', async () => {
    const f = fixture()
    f.get.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ data: {} } as never)
    expect(await f.sync({ 'score-90': early })).toBeNull()
    expect(await f.sync({ 'score-90': early })).toBeNull()
    expect(f.post).not.toHaveBeenCalled()
    expect(await f.sync({ 'score-90': early })).toEqual({ 'score-90': early })
  })
  it('filters unsupported IDs and invalid dates without sending arbitrary fields', async () => {
    const f = fixture()
    expect(await f.sync({ arbitrary: early, 'score-90': 'broken', 'first-drill': early })).toEqual({ 'first-drill': early })
    expect(f.post.mock.calls[0][1]).toEqual({ achievements: [{ id: 'first-drill', unlocked_at: early }] })
    expect(await f.sync([])).toBeNull()
  })
  it('keeps the input available for an idempotent retry after a failed write', async () => {
    const f = fixture()
    const local = { 'score-90': early }
    f.post.mockRejectedValueOnce(new Error('write response lost'))
    expect(await f.sync(local)).toBeNull()
    expect(local).toEqual({ 'score-90': early })
    expect(await f.sync(local)).toEqual(local)
    expect(f.post).toHaveBeenCalledTimes(2)
  })
})
