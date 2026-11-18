import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const runtime = vi.hoisted(() => ({ root: '' }))
vi.mock('electron', () => ({ app: { getPath: () => runtime.root } }))
vi.mock('./vod-compressor', () => ({
  recordingPathVariants: (value: string) => [value],
  sourcePathForCompressed: () => null,
  deleteLocalRecordingFiles: vi.fn(),
}))

import {
  CS2_FOCUS_CHECK_PATH, createCs2FocusChecker, cs2FocusCheckBody, cs2MatchExtras, cs2PlayedAt, type Cs2FocusRecording,
} from './cs2-focus-check'
import { RecordingsStore, type NewRecording } from './recordings-store'
import type { MatchData } from './riot-types'

const NOW = Date.UTC(2026, 10, 18, 12, 0, 0)
const START = NOW - 40 * 60_000
const JOB = '3f2b8c1e-7d4a-4f5b-9c2e-1a2b3c4d5e6f'
const stats = { score: '13-9', rounds: 22, player_stats: { kills: 20, adr: 85 }, round_stats: { ct_kd: 1.2 } }

function rec(over: Partial<Cs2FocusRecording> = {}): Cs2FocusRecording {
  return {
    id: 'rec-1', game: 'cs2', map: 'de_mirage', gameMode: 'Premier',
    timeline: { recordingStartTime: START, match_stats: stats, finalStats: { won: true } },
    ...over,
  }
}

describe('cs2PlayedAt', () => {
  it('uses the capture start, else the timeline recording start', () => {
    expect(cs2PlayedAt(rec({ captureRecordingStartTime: START - 1000 }), NOW)).toBe(new Date(START - 1000).toISOString())
    expect(cs2PlayedAt(rec(), NOW)).toBe(new Date(START).toISOString())
  })
  it('sends nothing for a missing, non-epoch or future start (the API would refuse it)', () => {
    expect(cs2PlayedAt(rec({ timeline: { match_stats: stats } }), NOW)).toBeNull()
    expect(cs2PlayedAt(rec({ captureRecordingStartTime: 12345 }), NOW)).toBeNull()
    expect(cs2PlayedAt(rec({ captureRecordingStartTime: NOW + 10 * 60_000 }), NOW)).toBeNull()
  })
})

describe('cs2MatchExtras', () => {
  it('adds played_at and a UUID demo job_id', () => {
    expect(cs2MatchExtras(rec({ cs2DemoJobId: JOB }), NOW)).toEqual({ played_at: new Date(START).toISOString(), job_id: JOB })
  })
  it('keeps the key the match was first counted under when a job is linked later', () => {
    expect(cs2MatchExtras(rec({ cs2DemoJobId: JOB, cs2FocusKeyJob: '' }), NOW)).toEqual({ played_at: new Date(START).toISOString() })
    expect(cs2MatchExtras(rec({ cs2DemoJobId: JOB, cs2FocusKeyJob: JOB }), NOW).job_id).toBe(JOB)
  })
  it('never sends a non-UUID job id (it would fail the whole notes call)', () => {
    expect(cs2MatchExtras(rec({ cs2DemoJobId: 'job-123' }), NOW)).toEqual({ played_at: new Date(START).toISOString() })
  })
  it('is empty for unknown or non-CS2 recordings', () => {
    expect(cs2MatchExtras(undefined, NOW)).toEqual({})
    expect(cs2MatchExtras(rec({ game: 'valorant' }), NOW)).toEqual({})
  })
})

describe('cs2FocusCheckBody', () => {
  it('has the notes call shape with played_at + job_id', () => {
    expect(cs2FocusCheckBody(rec({ cs2DemoJobId: JOB }), NOW)).toEqual({
      match_key: 'rec-1',
      facts: { map: 'de_mirage', won: true, game_mode: 'premier', match_stats: stats },
      played_at: new Date(START).toISOString(),
      job_id: JOB,
    })
  })
  it('is null until a demo was parsed (no measured player_stats)', () => {
    expect(cs2FocusCheckBody(rec({ timeline: { recordingStartTime: START } }), NOW)).toBeNull()
    expect(cs2FocusCheckBody(rec({ timeline: null }), NOW)).toBeNull()
    expect(cs2FocusCheckBody(rec({ game: 'deadlock' }), NOW)).toBeNull()
  })
})

describe('createCs2FocusChecker', () => {
  const log = { info: vi.fn(), warn: vi.fn() }
  const markCounted = vi.fn()
  beforeEach(() => { markCounted.mockClear() })

  it('posts once per recording', async () => {
    const post = vi.fn().mockResolvedValue(200)
    const checker = createCs2FocusChecker({ isAuthenticated: () => true, post, log, markCounted })
    expect(await checker.check(rec())).toBe('sent')
    expect(await checker.check(rec())).toBe('skipped')
    expect(post).toHaveBeenCalledTimes(1)
    expect(post.mock.calls[0][0]).toBe(CS2_FOCUS_CHECK_PATH)
    expect(markCounted).toHaveBeenCalledWith('rec-1', null)
  })

  it('remembers the demo job it was counted under, and never re-sends a counted match', async () => {
    const post = vi.fn().mockResolvedValue(200)
    const checker = createCs2FocusChecker({ isAuthenticated: () => true, post, log, markCounted })
    expect(await checker.check(rec({ cs2DemoJobId: JOB }))).toBe('sent')
    expect(markCounted).toHaveBeenCalledWith('rec-1', JOB)
    expect(await checker.check(rec({ id: 'other', cs2FocusKeyJob: '' }))).toBe('skipped')
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('sends nothing without a play time (the API would never count it)', async () => {
    const post = vi.fn().mockResolvedValue(200)
    const checker = createCs2FocusChecker({ isAuthenticated: () => true, post, log, markCounted })
    expect(await checker.check(rec({ timeline: { match_stats: stats } }))).toBe('skipped')
    expect(post).not.toHaveBeenCalled()
  })

  it('an API without the route (404/405) turns the checks off quietly for the session', async () => {
    for (const status of [404, 405]) {
      const post = vi.fn().mockResolvedValue(status)
      const checker = createCs2FocusChecker({ isAuthenticated: () => true, post, log, markCounted })
      expect(await checker.check(rec({ id: 'a' }))).toBe('unsupported')
      expect(await checker.check(rec({ id: 'b' }))).toBe('skipped')
      expect(post).toHaveBeenCalledTimes(1)
    }
    expect(markCounted).not.toHaveBeenCalled()
  })

  it('other failures are logged, not retried, and never throw', async () => {
    const post = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(500)
    const checker = createCs2FocusChecker({ isAuthenticated: () => true, post, log, markCounted })
    expect(await checker.check(rec({ id: 'a' }))).toBe('failed')
    expect(await checker.check(rec({ id: 'a' }))).toBe('skipped')
    expect(await checker.check(rec({ id: 'b' }))).toBe('failed')
    expect(post).toHaveBeenCalledTimes(2)
  })

  it('skips signed out and unparsed recordings without spending the attempt', async () => {
    let signedIn = false
    const post = vi.fn().mockResolvedValue(200)
    const checker = createCs2FocusChecker({ isAuthenticated: () => signedIn, post, log, markCounted })
    expect(await checker.check(rec())).toBe('skipped')
    expect(await checker.check(rec({ timeline: null }))).toBe('skipped')
    signedIn = true
    expect(await checker.check(rec())).toBe('sent')
  })
})

describe('recordings store wiring', () => {
  beforeEach(() => { runtime.root = fs.mkdtempSync(path.join(os.tmpdir(), 'upforge-cs2-focus-')) })
  afterEach(() => { fs.rmSync(runtime.root, { recursive: true, force: true }) })

  function recording(game: string): NewRecording {
    const filePath = path.join(runtime.root, `${game}.mp4`)
    fs.writeFileSync(filePath, 'recording')
    return { path: filePath, game, riotName: '', riotTag: '', map: null, agent: null, gameMode: 'premier', timeline: null }
  }

  it('links a CS2 demo job (UUID only, CS2 only) and keeps it across a reload', () => {
    const store = new RecordingsStore()
    const cs = store.add(recording('cs2'))
    const dl = store.add(recording('deadlock'))
    expect(store.setCs2DemoJob(cs.id, 'not-a-uuid')).toBe(false)
    expect(store.setCs2DemoJob(dl.id, JOB)).toBe(false)
    expect(store.setCs2DemoJob(cs.id, JOB)).toBe(true)
    expect(new RecordingsStore().getById(cs.id)?.cs2DemoJobId).toBe(JOB)
  })

  it('records the counted key once (first call wins) and keeps it across a reload', () => {
    const store = new RecordingsStore()
    const cs = store.add(recording('cs2'))
    expect(store.markCs2FocusCounted(cs.id, null)).toBe(true)
    expect(store.markCs2FocusCounted(cs.id, JOB)).toBe(false)
    expect(new RecordingsStore().getById(cs.id)?.cs2FocusKeyJob).toBe('')
  })

  it('tells the listener when a timeline is saved, also through a per-user view, and survives a throwing listener', () => {
    const store = new RecordingsStore()
    const cs = store.add(recording('cs2'))
    const seen: string[] = []
    store.timelineListener = (r) => { seen.push(r.id); throw new Error('boom') }
    const timeline = { game: 'cs2', recordingStartTime: START, match_stats: stats } as unknown as MatchData
    expect(store.updateTimeline(cs.id, timeline)).toBe(true)
    expect(store.forUser(null).updateTimeline(cs.id, timeline)).toBe(true)
    expect(seen).toEqual([cs.id, cs.id])
  })
})

describe('main process wiring', () => {
  const main = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
  it('the CS2 notes call sends played_at + job_id from the recording', () => {
    const start = main.indexOf("ipcMain.handle('match-report:game-notes'")
    const block = main.slice(start, main.indexOf('\n  })', start))
    expect(block).toMatch(/cs2MatchExtras\(recordingsStore\.getById\(matchId\)\)/)
    expect(block).toMatch(/\.\.\.cs2Extras/)
    expect(block).toMatch(/markCs2FocusCounted\(matchId/)
  })
  it('a saved timeline runs the focus check, and the demo retry links its CS2 job', () => {
    expect(main).toMatch(/recordingsStore\.timelineListener = \(rec\) => \{ void cs2FocusChecker\.check\(rec\) \}/)
    expect(main).toMatch(/recordingsStore\.setCs2DemoJob\(recordingId, jobId\)/)
  })
})
