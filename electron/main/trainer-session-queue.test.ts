import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_AGE_MS, MAX_UNSAVED_RUNS, TrainerSessionQueue, drillStateFrom, isRetryableUploadError, retryDelayMs, trainerRunKey } from './trainer-session-queue'

const run = (over: Record<string, unknown> = {}) => ({ scenario: 'flick', score: 70, completed_at: '2026-11-15T10:00:00Z', metadata: { user_drill_id: 4 }, ...over })
const httpError = (status: number, message = `HTTP ${status}`) => Object.assign(new Error(message), { status })
const HOUR = 60 * 60 * 1000

describe('TrainerSessionQueue', () => {
  let dir: string
  let file: string
  let now: number
  let timers: Array<{ fn: () => void; ms: number }>
  let user: number | null
  const make = (post: (p: Record<string, unknown>) => Promise<unknown>, opts: { token?: () => boolean; notify?: (o: unknown) => void; onChange?: () => void } = {}) =>
    new TrainerSessionQueue({ file, post, hasToken: opts.token ?? (() => true), currentUserId: () => user, notify: opts.notify, onChange: opts.onChange, now: () => now, schedule: (fn, ms) => timers.push({ fn, ms }) })
  const unsavedFile = () => path.join(dir, 'trainer-unsaved-sessions.json')
  const readUnsaved = () => JSON.parse(fs.readFileSync(unsavedFile(), 'utf8')) as Array<Record<string, unknown>>
  /** Let the queue's own timer run for `ms`: every due run is tried, as the app does while it stays open. */
  const runFor = async (q: TrainerSessionQueue, ms: number, step = 60_000) => {
    for (let t = 0; t < ms; t += step) { now += step; await q.flush() }
  }

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trainer-queue-'))
    file = path.join(dir, 'pending.json')
    now = 1_000_000
    timers = []
    user = 1
  })
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

  it.each([true, false])('preserves optional signed placement metadata across offline storage and retry (measured=%s)', async measured => {
    const metadata = measured ? { placement_samples: 10, mean_signed_vertical_error_deg: -0.4, mean_signed_horizontal_error_deg: 0.25 } : {}
    const payload = { ...run(), scenario: 'head_height', metadata }
    const offline = make(vi.fn().mockRejectedValue(new Error('offline')))
    await offline.submit(payload)
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'))[0].payload.metadata
    expect(saved).toMatchObject(metadata)
    const post = vi.fn().mockResolvedValue({})
    const online = make(post)
    now += HOUR
    await online.flush()
    const sent = JSON.parse(JSON.stringify(post.mock.calls[0][0]))
    expect(sent.metadata).toEqual(saved)
    if (measured) expect(typeof sent.metadata.mean_signed_vertical_error_deg).toBe('number')
    else {
      expect(sent.metadata).not.toHaveProperty('mean_signed_vertical_error_deg')
      expect(sent.metadata).not.toHaveProperty('mean_signed_horizontal_error_deg')
    }
  })

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

  it('moves a run the API rejects to the unsaved file with the API message instead of deleting it', async () => {
    const q = make(vi.fn().mockRejectedValue(httpError(422, 'The selected scenario is invalid.')))
    const out = await q.submit(run())
    expect(out.state).toBe('failed')
    expect(q.pendingCount).toBe(0)
    const unsaved = readUnsaved()
    expect(unsaved).toHaveLength(1)
    expect(unsaved[0]).toMatchObject({ clientRunId: out.clientRunId, ownerUserId: 1, reason: 'rejected', status: 422, message: 'The selected scenario is invalid.', failedAt: now })
    expect((unsaved[0].payload as { scenario: string }).scenario).toBe('flick')
    // Never resent on its own.
    now += 24 * HOUR
    const post = vi.fn().mockResolvedValue({})
    await make(post).flush()
    expect(post).not.toHaveBeenCalled()
  })

  // Runs used to be deleted after 12 failed tries (about 3 h 43 min of app time) whatever the error.
  for (const [label, error] of [['no network', new Error('ECONNREFUSED')], ['server down', httpError(503)], ['signed-out token', httpError(401)], ['rate limited', httpError(429)]] as const) {
    it(`keeps a run waiting after 12 failed tries (${label})`, async () => {
      const post = vi.fn().mockRejectedValue(error)
      const q = make(post)
      await q.submit(run())
      await runFor(q, 12 * HOUR)
      expect(post.mock.calls.length).toBeGreaterThan(12)
      expect(q.pendingCount).toBe(1)
      expect(q.outcomeFor(trainerRunKey('flick', '2026-11-15T10:00:00Z'))?.state).toBe('pending')
      expect(fs.existsSync(unsavedFile())).toBe(false)
    })
  }

  it('24 h offline, then online: the run uploads exactly once with its original run id', async () => {
    let online = false
    const post = vi.fn((_p: Record<string, unknown>) => online ? Promise.resolve({ drill: null }) : Promise.reject(new Error('getaddrinfo ENOTFOUND')))
    const notify = vi.fn()
    const q = make(post, { notify })
    const first = await q.submit(run())
    expect(first.state).toBe('pending')
    await runFor(q, 24 * HOUR)
    expect(q.pendingCount).toBe(1)

    online = true
    const callsWhileOffline = post.mock.calls.length
    await runFor(q, 5 * HOUR)
    expect(post.mock.calls.length - callsWhileOffline).toBe(1)
    const ids = new Set(post.mock.calls.map(c => (c[0] as { metadata: { client_run_id: string } }).metadata.client_run_id))
    expect(ids).toEqual(new Set([first.clientRunId]))
    expect(q.pendingCount).toBe(0)
    expect(q.outcomeFor(first.key)?.state).toBe('saved')
    expect(notify.mock.calls.filter(c => (c[0] as { state: string }).state === 'saved')).toHaveLength(1)
  })

  it('after 7 days without an upload, moves the run to the unsaved file and reports it as not saved', async () => {
    const q = make(vi.fn().mockRejectedValue(new Error('offline')))
    const out = await q.submit(run())
    await runFor(q, MAX_AGE_MS + HOUR, 30 * 60_000)
    expect(q.pendingCount).toBe(0)
    expect(q.outcomeFor(out.key)?.state).toBe('failed')
    expect(readUnsaved()).toEqual([expect.objectContaining({ clientRunId: out.clientRunId, reason: 'expired', status: null })])
  })

  it('a retry round writes the queue file once, not once per waiting run', async () => {
    // 400 runs waiting from an earlier session, all due; the network is down. Each round used to rewrite the
    // whole file once per run on the app's main process (seconds of freeze with a week of runs).
    const waiting = Array.from({ length: 400 }, (_, i) => ({ clientRunId: `run-${i}`, ownerUserId: 1, key: `flick|${i}`,
      payload: run({ completed_at: new Date(now - i * 120_000).toISOString() }), attempts: 1, nextAt: now, createdAt: now - HOUR }))
    fs.writeFileSync(file, JSON.stringify(waiting))
    const onChange = vi.fn()
    const post = vi.fn().mockRejectedValue(new Error('ECONNRESET'))
    const q = make(post, { onChange })
    await q.flush()
    expect(post).toHaveBeenCalledTimes(400)
    expect(onChange).toHaveBeenCalledTimes(1)
    const saved = JSON.parse(fs.readFileSync(file, 'utf8')) as Array<{ attempts: number; nextAt: number }>
    expect(saved).toHaveLength(400)
    expect(saved.every(r => r.attempts === 2 && r.nextAt === now + retryDelayMs(2))).toBe(true)
  })

  it('a round where runs land, wait and are refused still writes each file once, the unsaved copy first', async () => {
    const waiting = ['lands', 'offline', 'refused'].map(id => ({ clientRunId: id, ownerUserId: 1, key: `flick|${id}`,
      payload: run({ id }), attempts: 1, nextAt: now, createdAt: now - HOUR }))
    fs.writeFileSync(file, JSON.stringify(waiting))
    const post = vi.fn((p: Record<string, unknown>) => p.id === 'lands' ? Promise.resolve({}) : Promise.reject(p.id === 'refused' ? httpError(422) : new Error('offline')))
    const written: string[] = []
    const q = make(post, { onChange: () => written.push(fs.existsSync(unsavedFile()) ? 'with-unsaved' : 'pending-only') })
    const writes = vi.spyOn(fs, 'writeFileSync')
    try {
      await q.flush()
      const byFile = (f: string) => writes.mock.calls.filter(([p]) => String(p).startsWith(f)).length
      expect(byFile(unsavedFile())).toBe(1)
      expect(byFile(file)).toBe(1)
      // The unsaved copy is on disk before the queue file drops the refused run.
      expect(written).toEqual(['with-unsaved', 'with-unsaved'])
    } finally {
      writes.mockRestore()
    }
    expect((JSON.parse(fs.readFileSync(file, 'utf8')) as Array<{ clientRunId: string }>).map(r => r.clientRunId)).toEqual(['offline'])
    expect(readUnsaved().map(r => r.clientRunId)).toEqual(['refused'])
  })

  it('keeps only the newest unsaved runs', async () => {
    const q = make(vi.fn().mockRejectedValue(httpError(422)))
    for (let i = 0; i < MAX_UNSAVED_RUNS + 5; i++) { now += 1000; await q.submit(run({ completed_at: `2026-11-15T10:${String(i).padStart(2, '0')}:00Z` })) }
    const unsaved = readUnsaved()
    expect(unsaved).toHaveLength(MAX_UNSAVED_RUNS)
    expect((unsaved.at(-1)!.payload as { completed_at: string }).completed_at).toBe(`2026-11-15T10:${MAX_UNSAVED_RUNS + 4}:00Z`)
  })

  describe('upload status (runs waiting / not saved, per account)', () => {
    it('counts the signed-in account’s waiting and unsaved runs and says when they change', async () => {
      const onChange = vi.fn()
      let mode: 'offline' | 'reject' | 'ok' = 'offline'
      const post = vi.fn(() => mode === 'ok' ? Promise.resolve({}) : Promise.reject(mode === 'reject' ? httpError(422) : new Error('offline')))
      const q = make(post, { onChange })
      await q.submit(run({ completed_at: '2026-11-15T10:00:00Z' }))
      await q.submit(run({ completed_at: '2026-11-15T10:05:00Z' }))
      await q.submit(run({ completed_at: '2026-11-15T10:10:00Z' }))
      expect(q.uploadStatus()).toEqual({ waiting: 3, unsaved: 0 })
      expect(onChange).toHaveBeenCalled()

      user = 2
      expect(q.uploadStatus()).toEqual({ waiting: 0, unsaved: 0 })
      user = null
      expect(q.uploadStatus()).toEqual({ waiting: 0, unsaved: 0 })
      user = 1

      mode = 'ok'
      onChange.mockClear()
      await runFor(q, HOUR)
      expect(q.uploadStatus()).toEqual({ waiting: 0, unsaved: 0 })
      expect(onChange).toHaveBeenCalled()

      mode = 'reject'
      await q.submit(run({ completed_at: '2026-11-15T11:00:00Z' }))
      expect(q.uploadStatus()).toEqual({ waiting: 0, unsaved: 1 })
      // Still counted a week later: Retry can send it whenever the player is back online.
      now += MAX_AGE_MS + 1
      expect(q.uploadStatus()).toEqual({ waiting: 0, unsaved: 1 })
      expect(readUnsaved()).toHaveLength(1)
    })

    it('reads the unsaved file back after a restart', async () => {
      await make(vi.fn().mockRejectedValue(httpError(422))).submit(run())
      expect(make(vi.fn()).uploadStatus()).toEqual({ waiting: 0, unsaved: 1 })
    })

    it('lists the signed-in account’s unsaved runs with the reason, newest first, without the run data', async () => {
      const q = make(vi.fn().mockRejectedValue(httpError(422, 'The selected scenario is invalid.')))
      await q.submit(run({ scenario: 'flick', completed_at: '2026-11-15T10:00:00Z' }))
      now += 1000
      await q.submit(run({ scenario: 'gridshot', completed_at: '2026-11-15T10:05:00Z' }))
      user = 2
      await q.submit(run({ scenario: 'tracking' }))
      expect(q.unsavedRuns().map(r => r.scenario)).toEqual(['tracking'])
      user = 1
      const list = q.unsavedRuns()
      expect(list.map(r => r.scenario)).toEqual(['gridshot', 'flick'])
      expect(list[0]).toEqual({ clientRunId: expect.any(String), scenario: 'gridshot', completedAt: '2026-11-15T10:05:00Z', reason: 'rejected', status: 422, message: 'The selected scenario is invalid.', failedAt: now })
      user = null
      expect(q.unsavedRuns()).toEqual([])
    })
  })

  describe('unsaved runs: per-account cap, the 7-day rule and Retry', () => {
    it('caps the unsaved file per account: one account’s refused runs never push out another’s', async () => {
      const q = make(vi.fn().mockRejectedValue(httpError(422)))
      await q.submit(run({ completed_at: '2026-11-15T09:00:00Z' }))
      user = 2
      for (let i = 0; i < MAX_UNSAVED_RUNS + 5; i++) { now += 1000; await q.submit(run({ completed_at: `2026-11-15T10:${String(i).padStart(2, '0')}:00Z` })) }
      const owners = readUnsaved().map(r => r.ownerUserId)
      expect(owners.filter(o => o === 1)).toHaveLength(1)
      expect(owners.filter(o => o === 2)).toHaveLength(MAX_UNSAVED_RUNS)
      user = 1
      expect(q.uploadStatus()).toEqual({ waiting: 0, unsaved: 1 })
    })

    it('an app closed for 10 days sends its runs on the next start, in the first round it is signed in', async () => {
      // Three runs that could not be sent; then the app stays closed for 10 days.
      const offline = make(vi.fn().mockRejectedValue(new Error('offline')))
      const ids: string[] = []
      for (const at of ['10:00', '10:05', '10:10']) ids.push((await offline.submit(run({ completed_at: `2026-11-15T${at}:00Z` }))).clientRunId)
      now += 10 * 24 * HOUR
      const post = vi.fn().mockResolvedValue({ drill: null })
      // The app's first round runs before its saved sign-in has loaded: no try yet, and nothing moves.
      user = null
      const q = make(post)
      await q.flush()
      expect(post).not.toHaveBeenCalled()
      expect(q.pendingCount).toBe(3)
      expect(fs.existsSync(unsavedFile())).toBe(false)
      // Signed in and online: the next round sends each run once, with its own run id.
      user = 1
      await runFor(q, HOUR)
      expect(post.mock.calls.map(c => (c[0] as { metadata: { client_run_id: string } }).metadata.client_run_id)).toEqual(ids)
      expect(q.uploadStatus()).toEqual({ waiting: 0, unsaved: 0 })
      expect(fs.existsSync(unsavedFile())).toBe(false)
    })

    it('an app closed for 10 days and opened offline tries the run once, then keeps it for Retry', async () => {
      await make(vi.fn().mockRejectedValue(new Error('offline'))).submit(run())
      now += 10 * 24 * HOUR
      const post = vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND'))
      const q = make(post)
      await q.flush()
      expect(post).toHaveBeenCalledTimes(1)
      expect(q.pendingCount).toBe(0)
      // Kept on disk with the reason, for Retry; no more background tries.
      expect(readUnsaved()).toEqual([expect.objectContaining({ ownerUserId: 1, reason: 'expired', status: null })])
      expect(q.uploadStatus()).toEqual({ waiting: 0, unsaved: 1 })
      await runFor(q, 24 * HOUR, 30 * 60_000)
      expect(post).toHaveBeenCalledTimes(1)
    })

    it('a run past its 7 days waits for its own account like a younger run, then gets its one try', async () => {
      await make(vi.fn().mockRejectedValue(new Error('offline'))).submit(run())
      now += 10 * 24 * HOUR
      const post = vi.fn().mockRejectedValue(httpError(503))
      user = 2
      const q = make(post)
      await runFor(q, HOUR)
      expect(post).not.toHaveBeenCalled()
      expect(q.pendingCount).toBe(1)
      user = 1
      await runFor(q, 24 * HOUR, 30 * 60_000)
      expect(post).toHaveBeenCalledTimes(1)
      expect(readUnsaved()).toEqual([expect.objectContaining({ ownerUserId: 1, reason: 'expired' })])
    })

    it('Retry sends a run that expired while offline once online, with its original run id', async () => {
      let online = false
      const post = vi.fn((_p: Record<string, unknown>) => online ? Promise.resolve({ drill: null }) : Promise.reject(new Error('getaddrinfo ENOTFOUND')))
      const q = make(post)
      const first = await q.submit(run())
      await runFor(q, MAX_AGE_MS + HOUR, 30 * 60_000)
      expect(q.uploadStatus()).toEqual({ waiting: 0, unsaved: 1 })

      online = true
      const calls = post.mock.calls.length
      expect(await q.retryUnsaved()).toBe(1)
      expect(post.mock.calls.length - calls).toBe(1)
      expect((post.mock.calls.at(-1)![0] as { metadata: { client_run_id: string } }).metadata.client_run_id).toBe(first.clientRunId)
      expect(q.outcomeFor(first.key)?.state).toBe('saved')
      expect(q.uploadStatus()).toEqual({ waiting: 0, unsaved: 0 })
      expect(readUnsaved()).toEqual([])
      expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual([])
    })

    it('Retry while still offline gives the run another 7 days of background tries, from the press', async () => {
      let online = false
      const post = vi.fn(() => online ? Promise.resolve({}) : Promise.reject(new Error('offline')))
      const q = make(post)
      await q.submit(run())
      await runFor(q, MAX_AGE_MS + HOUR, 30 * 60_000)
      expect(await q.retryUnsaved()).toBe(1)
      expect(q.uploadStatus()).toEqual({ waiting: 1, unsaved: 0 })
      await runFor(q, 3 * 24 * HOUR, 30 * 60_000)
      expect(q.uploadStatus()).toEqual({ waiting: 1, unsaved: 0 })
      online = true
      await runFor(q, HOUR)
      expect(q.uploadStatus()).toEqual({ waiting: 0, unsaved: 0 })
    })

    it('Retry resends only the signed-in account’s runs; one refused again keeps the API’s new reason', async () => {
      const post = vi.fn().mockRejectedValue(httpError(422, 'The selected scenario is invalid.'))
      const q = make(post)
      await q.submit(run({ completed_at: '2026-11-15T10:00:00Z' }))
      user = 2
      const theirs = await q.submit(run({ completed_at: '2026-11-15T10:05:00Z' }))
      post.mockClear()
      post.mockRejectedValue(httpError(422, 'The heatmap field must not have more than 5000 items.'))
      now += HOUR
      expect(await q.retryUnsaved()).toBe(1)
      expect(post).toHaveBeenCalledTimes(1)
      expect((post.mock.calls[0][0] as { metadata: { client_run_id: string } }).metadata.client_run_id).toBe(theirs.clientRunId)
      expect(q.unsavedRuns()).toEqual([expect.objectContaining({ clientRunId: theirs.clientRunId, message: 'The heatmap field must not have more than 5000 items.', failedAt: now })])
      user = 1
      expect(q.unsavedRuns()).toEqual([expect.objectContaining({ message: 'The selected scenario is invalid.' })])
      user = null
      expect(await q.retryUnsaved()).toBe(0)
    })

    it('Retry writes the queue file before it takes a run out of the unsaved file: never in neither', async () => {
      const snapshots: Array<{ pending: boolean; unsaved: boolean }> = []
      const has = (f: string, id: string) => fs.existsSync(f) && (JSON.parse(fs.readFileSync(f, 'utf8')) as Array<{ clientRunId: string }>).some(r => r.clientRunId === id)
      let id = ''
      const q = make(vi.fn().mockRejectedValue(httpError(422)), { onChange: () => { if (id) snapshots.push({ pending: has(file, id), unsaved: has(unsavedFile(), id) }) } })
      id = (await q.submit(run())).clientRunId
      snapshots.length = 0
      expect(await q.retryUnsaved()).toBe(1)
      expect(snapshots.length).toBeGreaterThanOrEqual(4)
      expect(snapshots.every(s => s.pending || s.unsaved)).toBe(true)
      expect(snapshots.at(-1)).toEqual({ pending: false, unsaved: true })
    })

    it('a run a crash left in both files counts once, and leaves the unsaved file when it lands', async () => {
      const entry = { clientRunId: 'both', ownerUserId: 1, key: 'flick|x', payload: run(), attempts: 0, nextAt: now, createdAt: now - HOUR }
      fs.writeFileSync(file, JSON.stringify([entry]))
      fs.writeFileSync(unsavedFile(), JSON.stringify([{ ...entry, failedAt: now - 1000, reason: 'rejected', status: 422, message: 'x' }]))
      const q = make(vi.fn().mockResolvedValue({ drill: null }))
      expect(q.uploadStatus()).toEqual({ waiting: 1, unsaved: 0 })
      await q.flush()
      expect(readUnsaved()).toEqual([])
      expect(q.uploadStatus()).toEqual({ waiting: 0, unsaved: 0 })
    })
  })

  it('passes on why the API saved a run without counting it (unranked_reason), and nothing from older APIs', async () => {
    const post = vi.fn()
      .mockResolvedValueOnce({ session: { id: 1, unranked_reason: 'no_hits' }, drill: null })
      .mockResolvedValueOnce({ session: { id: 2, unranked_reason: null }, drill: null })
      .mockResolvedValueOnce({ drill: null })
    const q = make(post)
    expect(await q.submit(run({ completed_at: '2026-11-15T10:00:00Z' }))).toMatchObject({ state: 'saved', unrankedReason: 'no_hits' })
    expect(await q.submit(run({ completed_at: '2026-11-15T10:05:00Z' }))).not.toHaveProperty('unrankedReason')
    expect(await q.submit(run({ completed_at: '2026-11-15T10:10:00Z' }))).not.toHaveProperty('unrankedReason')
  })

  describe('first upload attempt', () => {
    it('is on disk before the first POST, so a crash mid-request resends the same run once on restart', async () => {
      let release: (v: unknown) => void = () => {}
      const hung = vi.fn((_p: Record<string, unknown>) => new Promise((r) => { release = r }))
      const q = make(hung)
      const submitted = q.submit(run(), 1)
      // The POST is in flight and never answers: the run must already be saved with its owner + id.
      expect(hung).toHaveBeenCalledTimes(1)
      const saved = JSON.parse(fs.readFileSync(file, 'utf8')) as Array<{ clientRunId: string; ownerUserId: number; payload: { scenario: string; metadata: Record<string, unknown> } }>
      expect(saved).toHaveLength(1)
      const sentId = (hung.mock.calls[0][0] as { metadata: { client_run_id: string } }).metadata.client_run_id
      expect(saved[0].clientRunId).toBe(sentId)
      expect(saved[0].ownerUserId).toBe(1)
      expect(saved[0].payload.scenario).toBe('flick')
      expect(saved[0].payload.metadata).toMatchObject({ user_drill_id: 4, client_run_id: sentId })

      // While the first request is in flight a flush must not send it a second time.
      now += 60 * 60 * 1000
      await q.flush()
      expect(hung).toHaveBeenCalledTimes(1)

      // "Restart": a new queue on the same file resends with the same client_run_id (server dedupes).
      const post = vi.fn().mockResolvedValue({ drill: null })
      const restarted = make(post)
      expect(restarted.pendingCount).toBe(1)
      await restarted.flush()
      expect(post).toHaveBeenCalledTimes(1)
      expect((post.mock.calls[0][0] as { metadata: { client_run_id: string } }).metadata.client_run_id).toBe(sentId)
      expect(restarted.pendingCount).toBe(0)
      expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toHaveLength(0)

      release({ drill: null })
      expect((await submitted).state).toBe('saved')
    })

    it('removes the saved copy once the first POST is accepted', async () => {
      const q = make(vi.fn().mockResolvedValue({ drill: null }))
      expect((await q.submit(run())).state).toBe('saved')
      expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toHaveLength(0)
    })

    it('says so when the run could not be kept on disk instead of promising retries', async () => {
      const blocker = path.join(dir, 'not-a-dir')
      fs.writeFileSync(blocker, 'x')
      file = path.join(blocker, 'pending.json')
      const q = make(vi.fn().mockRejectedValue(new Error('offline')))
      const out = await q.submit(run())
      expect(out.state).toBe('pending')
      expect(out.stored).toBe(false)
    })
  })

  describe('account ownership', () => {
    it('a run queued by account A never posts while B is signed in, and uploads once A returns', async () => {
      const post = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({})
      const notify = vi.fn()
      user = 101
      const q = make(post, { notify })
      expect((await q.submit(run())).state).toBe('pending')
      notify.mockClear()

      user = 202
      now += 60 * 60 * 1000
      await q.flush()
      expect(post).toHaveBeenCalledTimes(1) // only A's original attempt
      expect(q.pendingCount).toBe(1)
      expect(notify).not.toHaveBeenCalled() // B sees no A sync events

      // Survives restart: a new queue reading the same file still knows the owner.
      user = 101
      const restarted = make(post, { notify })
      now += 60 * 60 * 1000
      await restarted.flush()
      expect(post).toHaveBeenCalledTimes(2)
      expect(restarted.pendingCount).toBe(0)
      const ids = post.mock.calls.map(c => (c[0] as { metadata: { client_run_id: string } }).metadata.client_run_id)
      expect(ids[0]).toBe(ids[1])
    })

    it('a trainer launched by A whose result arrives after switching to B is queued for A', async () => {
      const post = vi.fn().mockResolvedValue({})
      user = 202
      const q = make(post)
      const out = await q.submit(run(), 101)
      expect(post).not.toHaveBeenCalled()
      expect(out.state).toBe('pending')
      expect(q.pendingCount).toBe(1)
    })

    it('runs from older builds without an owner are kept, never claimed by whoever signs in', async () => {
      fs.writeFileSync(file, JSON.stringify([{ clientRunId: 'legacy', key: 'k', payload: run(), attempts: 0, nextAt: 0, createdAt: now }]))
      const post = vi.fn().mockResolvedValue({})
      user = 202
      const q = make(post)
      await q.flush()
      expect(post).not.toHaveBeenCalled()
      expect(q.pendingCount).toBe(1)
      // No account can ever send it: after its 7 days it moves to the unsaved file, still unsent.
      now += MAX_AGE_MS + HOUR
      await q.flush()
      expect(post).not.toHaveBeenCalled()
      expect(q.pendingCount).toBe(0)
      expect(readUnsaved()).toEqual([expect.objectContaining({ clientRunId: 'legacy', ownerUserId: null, reason: 'expired' })])
    })
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

describe('drillStateFrom', () => {
  const base = { id: 4, title: 'Head Height', status: 'active', completed: false, attempt_count: 2, attempts_allowed: 3, pass_score: 70, next: null }
  it('keeps the practice-pass and verified fields from newer APIs', () => {
    const d = drillStateFrom({ drill: { ...base, practice_passed: true, practice_passed_at: '2026-11-16T10:00:00Z', verified: false, verified_by: null } })
    expect(d).toMatchObject({ practice_passed: true, practice_passed_at: '2026-11-16T10:00:00Z', verified: false })
    expect(d).not.toHaveProperty('verified_by')
  })
  it('leaves them out for older APIs', () => {
    const d = drillStateFrom({ drill: base })
    expect(d).not.toHaveProperty('practice_passed')
    expect(d).not.toHaveProperty('verified')
  })
})
