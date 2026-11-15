import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_ATTEMPTS, TrainerSessionQueue, isRetryableUploadError, retryDelayMs, trainerRunKey } from './trainer-session-queue'

const run = (over: Record<string, unknown> = {}) => ({ scenario: 'flick', score: 70, completed_at: '2026-11-15T10:00:00Z', metadata: { user_drill_id: 4 }, ...over })
const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status })

describe('TrainerSessionQueue', () => {
  let dir: string
  let file: string
  let now: number
  let timers: Array<{ fn: () => void; ms: number }>
  const make = (post: (p: Record<string, unknown>) => Promise<unknown>, opts: { token?: () => boolean; notify?: (o: unknown) => void } = {}) =>
    new TrainerSessionQueue({ file, post, hasToken: opts.token ?? (() => true), notify: opts.notify, now: () => now, schedule: (fn, ms) => timers.push({ fn, ms }) })

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trainer-queue-'))
    file = path.join(dir, 'pending.json')
    now = 1_000_000
    timers = []
  })
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

  it('uploads once with a client run id and reports the drill state', async () => {
    const post = vi.fn().mockResolvedValue({ drill: { id: 4, title: 'Flick', status: 'completed', completed: true, attempt_count: 1, attempts_allowed: 3, pass_score: 70, next: { id: 5, title: 'Flick (Hard)', trainer_difficulty: 'hard', pass_score: 70 } } })
    const notify = vi.fn()
    const q = make(post, { notify })
    const out = await q.submit(run())
    expect(post).toHaveBeenCalledTimes(1)
    const sent = post.mock.calls[0][0] as { metadata: Record<string, unknown> }
    expect(sent.metadata.user_drill_id).toBe(4)
    expect(typeof sent.metadata.client_run_id).toBe('string')
    expect(out.state).toBe('saved')
    expect(out.drill?.next?.trainer_difficulty).toBe('hard')
    expect(notify).toHaveBeenCalledWith(out)
    expect(q.outcomeFor(trainerRunKey('flick', '2026-11-15T10:00:00Z'))).toEqual(out)
    expect(q.pendingCount).toBe(0)
  })

  it('keeps a failed run on disk and resends the same run id until it lands', async () => {
    const post = vi.fn().mockRejectedValueOnce(new Error('ECONNRESET')).mockRejectedValueOnce(httpError(503)).mockResolvedValue({ drill: null })
    const q = make(post)
    expect((await q.submit(run())).state).toBe('pending')
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toHaveLength(1)
    expect(timers.at(-1)!.ms).toBe(retryDelayMs(1))

    // Not due yet: nothing is sent.
    await q.flush()
    expect(post).toHaveBeenCalledTimes(1)

    now += retryDelayMs(1)
    await q.flush()
    expect(post).toHaveBeenCalledTimes(2)
    now += retryDelayMs(2)
    await q.flush()
    expect(post).toHaveBeenCalledTimes(3)
    const ids = post.mock.calls.map(c => (c[0] as { metadata: { client_run_id: string } }).metadata.client_run_id)
    expect(new Set(ids).size).toBe(1)
    expect(q.pendingCount).toBe(0)
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual([])
  })

  it('survives a restart: a new queue picks the saved run up', async () => {
    await make(vi.fn().mockRejectedValue(new Error('offline'))).submit(run())
    const post = vi.fn().mockResolvedValue({})
    const q2 = make(post)
    expect(q2.pendingCount).toBe(1)
    now += retryDelayMs(1)
    await q2.flush()
    expect(post).toHaveBeenCalledTimes(1)
    expect(q2.pendingCount).toBe(0)
  })

  it('waits while signed out and does not count that as a failed try', async () => {
    let signedIn = false
    const post = vi.fn().mockResolvedValue({})
    const q = make(post, { token: () => signedIn })
    expect((await q.submit(run())).state).toBe('pending')
    expect(post).not.toHaveBeenCalled()
    signedIn = true
    now += retryDelayMs(1)
    await q.flush()
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('drops a run the API rejects as invalid and reports it as not saved', async () => {
    const q = make(vi.fn().mockRejectedValue(httpError(422)))
    const out = await q.submit(run())
    expect(out.state).toBe('failed')
    expect(q.pendingCount).toBe(0)
  })

  it('gives up after the attempt limit', async () => {
    const q = make(vi.fn().mockRejectedValue(httpError(500)))
    await q.submit(run())
    for (let i = 1; i < MAX_ATTEMPTS; i++) { now += 3_600_000; await q.flush() }
    expect(q.pendingCount).toBe(0)
    expect(q.outcomeFor(trainerRunKey('flick', '2026-11-15T10:00:00Z'))?.state).toBe('failed')
  })
})

describe('upload retry rules', () => {
  it('retries network, auth, rate-limit and server errors only', () => {
    expect(isRetryableUploadError(new Error('ECONNREFUSED'))).toBe(true)
    for (const s of [401, 408, 429, 500, 502]) expect(isRetryableUploadError(httpError(s)), String(s)).toBe(true)
    for (const s of [400, 403, 404, 422]) expect(isRetryableUploadError(httpError(s)), String(s)).toBe(false)
  })
  it('backs off and caps the delay', () => {
    expect([1, 2, 3, 4, 5, 9].map(retryDelayMs)).toEqual([5_000, 30_000, 120_000, 600_000, 1_800_000, 1_800_000])
  })
})
