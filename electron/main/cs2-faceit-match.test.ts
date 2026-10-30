import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  FaceitLinkStore,
  findFaceitMatchForRecording,
  pickFaceitMatchForRecording,
  queueFaceitMatch,
  registerCs2FaceitMatchIpc,
  type FaceitApi,
  type FaceitMatchSummary,
} from './cs2-faceit-match'

const START = Date.UTC(2026, 9, 30, 18, 0, 0)
const sec = (ms: number) => Math.floor(ms / 1000)
const ID = (n: number) => `1-0000000${n}-aaaa-bbbb-cccc-dddddddddddd`
const m = (n: number, map: string | null, finishedMs: number): FaceitMatchSummary => ({ match_id: ID(n), map, finished_at: sec(finishedMs) })

describe('pickFaceitMatchForRecording', () => {
  it('picks the one match that ended near the recording end on the same map', () => {
    const r = pickFaceitMatchForRecording(
      [m(1, 'de_mirage', START + 40 * 60e3), m(2, 'de_inferno', START + 41 * 60e3), m(3, 'de_mirage', START - 120 * 60e3)],
      { startedAtMs: START, endedAtMs: START + 42 * 60e3, map: 'mirage' },
    )
    expect(r.match?.match_id).toBe(ID(1))
  })

  it('without an end time, needs the match to finish 5–90 minutes after the recording started', () => {
    expect(pickFaceitMatchForRecording([m(1, 'de_nuke', START + 2 * 60e3)], { startedAtMs: START, map: 'de_nuke' }).match).toBeNull()
    expect(pickFaceitMatchForRecording([m(1, 'de_nuke', START + 35 * 60e3)], { startedAtMs: START, map: 'de_nuke' }).match?.match_id).toBe(ID(1))
  })

  it('refuses to guess when two matches fit', () => {
    const r = pickFaceitMatchForRecording([m(1, null, START + 30 * 60e3), m(2, null, START + 45 * 60e3)], { startedAtMs: START })
    expect(r).toEqual({ match: null, reason: 'ambiguous' })
  })

  it('requires FACEIT to know the map when the recording does', () => {
    expect(pickFaceitMatchForRecording([m(1, null, START + 30 * 60e3)], { startedAtMs: START, map: 'de_ancient' }).match).toBeNull()
  })

  it('reports none in window', () => {
    expect(pickFaceitMatchForRecording([m(1, 'de_mirage', START + 300 * 60e3)], { startedAtMs: START, map: 'de_mirage' }).reason).toBe('none_in_window')
  })
})

function fakeApi(over: Partial<{ connection: unknown; matches: unknown; analyze: unknown; fail: boolean }> = {}) {
  const calls: Array<{ method: string; url: string; body?: unknown; params?: unknown }> = []
  const api: FaceitApi = {
    get: vi.fn(async (url: string, config?: { params?: Record<string, unknown> }) => {
      calls.push({ method: 'GET', url, params: config?.params })
      if (over.fail) throw { response: { data: { message: 'FACEIT is down' } } }
      if (url.endsWith('/connection')) return { data: over.connection ?? { connected: true, nickname: 'MyNick' } }
      return { data: over.matches ?? { matches: [{ match_id: ID(1), map: 'de_mirage', finished_at: sec(START + 40 * 60e3) }] } }
    }),
    post: vi.fn(async (url: string, body: unknown) => {
      calls.push({ method: 'POST', url, body })
      return { data: over.analyze ?? { success: true, job_id: 'job-123' } }
    }),
  }
  return { api, calls }
}

describe('findFaceitMatchForRecording (existing endpoints only)', () => {
  it('reads the connection, lists that nickname\'s matches and picks one, without starting anything', async () => {
    const { api, calls } = fakeApi()
    const r = await findFaceitMatchForRecording(api, { startedAtMs: START, endedAtMs: START + 41 * 60e3, map: 'de_mirage' })
    expect(r).toEqual({ status: 'matched', match: expect.objectContaining({ match_id: ID(1) }) })
    expect(calls.map(c => `${c.method} ${c.url}`)).toEqual(['GET /api/cs2/faceit/connection', 'GET /api/cs2/faceit/matches'])
    expect(calls[1]!.params).toEqual({ username: 'MyNick' })
  })

  it('says not connected when FACEIT isn\'t linked', async () => {
    const { api } = fakeApi({ connection: { connected: false } })
    expect(await findFaceitMatchForRecording(api, { startedAtMs: START })).toEqual({ status: 'not_connected' })
    expect(await findFaceitMatchForRecording(null, { startedAtMs: START })).toEqual({ status: 'not_connected' })
  })

  it('passes the server message through on errors', async () => {
    const { api } = fakeApi({ fail: true })
    expect(await findFaceitMatchForRecording(api, { startedAtMs: START })).toEqual({ status: 'error', message: 'FACEIT is down' })
  })
})

describe('queueFaceitMatch', () => {
  it('refuses malformed ids before calling the API', async () => {
    const { api, calls } = fakeApi()
    expect(await queueFaceitMatch(api, '../../admin')).toEqual({ ok: false, error: 'Invalid FACEIT match id' })
    expect(calls).toHaveLength(0)
  })

  it('posts to the existing FACEIT analyse route', async () => {
    const { api, calls } = fakeApi()
    expect(await queueFaceitMatch(api, ID(1))).toEqual({ ok: true, jobId: 'job-123' })
    expect(calls).toEqual([{ method: 'POST', url: '/api/cs2/faceit/analyze', body: { match_id: ID(1) } }])
  })
})

describe('IPC + link store', () => {
  it('attaching twice for the same recording and match queues only once', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uf-faceit-'))
    const handlers = new Map<string, (e: unknown, ...a: unknown[]) => unknown>()
    const { api, calls } = fakeApi()
    registerCs2FaceitMatchIpc({ handle: (c, fn) => handlers.set(c, fn) }, () => api, new FaceitLinkStore(dir))
    const attach = handlers.get('cs2:attach-faceit-match')!
    expect(await attach(null, 'rec-1', ID(1))).toEqual({ ok: true, jobId: 'job-123' })
    expect(await attach(null, 'rec-1', ID(1))).toEqual({ ok: true, jobId: 'job-123', already: true })
    expect(calls.filter(c => c.method === 'POST')).toHaveLength(1)
    expect(await handlers.get('cs2:get-faceit-link')!(null, 'rec-1')).toEqual(expect.objectContaining({ matchId: ID(1), jobId: 'job-123' }))
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('find never posts (looking up is free; only the tap spends)', async () => {
    const handlers = new Map<string, (e: unknown, ...a: unknown[]) => unknown>()
    const { api, calls } = fakeApi()
    registerCs2FaceitMatchIpc({ handle: (c, fn) => handlers.set(c, fn) }, () => api, new FaceitLinkStore(os.tmpdir()))
    await handlers.get('cs2:find-faceit-match')!(null, { startedAtMs: START, map: 'de_mirage' })
    expect(calls.some(c => c.method === 'POST')).toBe(false)
  })
})
