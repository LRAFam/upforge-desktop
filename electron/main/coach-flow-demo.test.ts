import { describe, expect, it, vi } from 'vitest'
import { mkdtemp, readdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { CoachFlowCachedReplay, CoachFlowDemoRun, ESTIMATE_USD, RUN_BUDGET_USD, decisiveVideoMs, readCachedRun, roundStillTimes, withinBudget, type FlowEvent } from './coach-flow-demo'

const W = (id: string, s: number, e: number) => ({ moment_id: id, round: 3, window_start_ms: s, window_end_ms: e, fps: 6 })
const MATCH = { map: 'Bind', agent: 'Jett', finalScore: { allyScore: 13, enemyScore: 10 }, roundSummaries: [{}, {}], puuid: 'me' }

function deps(over: Partial<Parameters<typeof makeRun>[0]> = {}) {
  return makeRun(over)
}

function makeRun(over: { reviewCost?: number; noUrl?: boolean; momentCost?: number; cacheDir?: string; hiddenMoment?: boolean; habits?: string[] | null } = {}) {
  const bodies: Record<string, unknown> = {}
  const events: FlowEvent[] = []
  const calls: string[] = []
  const fetchImpl = vi.fn(async (url: string, init: { body?: unknown }) => {
    const path = new URL(url).pathname
    calls.push(path)
    const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body })
    if (path === '/api/match-report') return json({ notes: { headline: { text: 'You died first in 6 rounds.' } }, cost_usd: 0.002 })
    if (path === '/api/coach-flow/plan') {
      bodies.plan = init.body
      return json({
        round: { round_number: 3, why: 'Round 3: you died first.', windows: [W('round3-overview', 1000, 20000), W('round3-1', 15000, 22000)] },
        moments: [{ round_number: 7, why: 'Round 7: lost clutch.', window: { ...W('moment-r7', 50000, 58000), round: 7 } }],
      })
    }
    if (path === '/api/coach-flow/moment') {
      expect(init.body).toBeInstanceOf(FormData)
      if (over.hiddenMoment) return json({ success: false, hidden: true, error_code: 'not_enough_to_coach', cost: { total_usd: 0.03 } })
      return json({ story: 'You swung alone.', fixes: [{ title: 'Wait for the flash', evidence_ms: [55000] }], cost: { total_usd: over.momentCost ?? 0.02 } })
    }
    if (path === '/api/coach-flow/round-review') return json({ success: true, story: 'Round story.', fixes: [{ title: 'Fix 1' }, { title: 'Fix 2' }], cost: { total_usd: over.reviewCost ?? 0.05 } })
    return { ok: false, status: 404, json: async () => ({}) }
  })
  let t = 0
  const run = new CoachFlowDemoRun({
    api: { get: async () => ({ data: { analysis: { id: 1, match_data: MATCH } } }) },
    playbackUrl: async () => (over.noUrl ? null : 'https://cdn.example/rec.mp4?sig=secret'),
    aiUrl: 'http://127.0.0.1:8011',
    aiKey: 'demo',
    ffmpeg: 'ffmpeg',
    emit: e => events.push(e),
    now: () => (t += 100),
    fetchImpl: fetchImpl as unknown as typeof fetch,
    cut: async (_url, _s, _e, out) => { await writeFile(out, Buffer.alloc(1000)) },
    still: async (_clip, _ms, out) => { await writeFile(out, Buffer.from([0xff, 0xd8, 0xff])) },
    cacheDir: over.cacheDir ?? null,
    habits: over.habits === undefined ? undefined : async () => over.habits ?? null,
  })
  return { run, events, calls, bodies }
}

describe('withinBudget', () => {
  it('refuses a call that could cross the cap', () => {
    expect(withinBudget(0, ESTIMATE_USD.round)).toBe(true)
    expect(withinBudget(RUN_BUDGET_USD - 0.1, ESTIMATE_USD.round)).toBe(false)
  })
})

describe('CoachFlowDemoRun', () => {
  it('runs report, plan, local clips and key moments, then offers the round', async () => {
    const { run, events, calls } = deps()
    await run.run(1)
    const done = events.filter(e => e.state === 'done').map(e => e.step)
    expect(done).toEqual(expect.arrayContaining(['match-end', 'match-data', 'report', 'plan', 'clips', 'moment-1', 'round-offer']))
    expect(calls).not.toContain('/api/coach-flow/round-review')
    expect(events.at(-1)?.step).toBe('__idle')
    expect(run.spentUsd).toBeCloseTo(0.022, 5)
    // The signed URL never reaches the screen.
    expect(JSON.stringify(events)).not.toContain('sig=secret')
  })

  it('settles a moment the coach could not ground without showing it, and still meters it', async () => {
    const { run, events } = deps({ hiddenMoment: true })
    await run.run(1)
    const m = events.find(e => e.step === 'moment-1' && e.state === 'done')
    expect(m?.payload).toBeUndefined()
    expect(m?.detail).toContain('not shown')
    expect(run.spentUsd).toBeCloseTo(0.032, 5)
  })

  it('sends the player habits with the match data, and coaches without them when they fail', async () => {
    const withHabits = deps({ habits: ['Died first without a teammate near (flagged in 6 matches)'] })
    await withHabits.run.run(1)
    expect(String(withHabits.bodies.plan)).toContain('playerHabits')
    const none = deps({ habits: null })
    await none.run.run(1)
    expect(String(none.bodies.plan)).not.toContain('playerHabits')
    expect(none.events.some(e => e.step === 'moment-1' && e.state === 'done')).toBe(true)
  })

  it('reviews the round only when asked, and records its cost', async () => {
    const { run, events, calls } = deps()
    await run.run(1)
    await run.reviewRound()
    expect(calls).toContain('/api/coach-flow/round-review')
    const rr = events.find(e => e.step === 'round-review' && e.state === 'done')
    expect(rr?.costUsd).toBe(0.05)
    expect((rr?.payload as { fixes: unknown[] }).fixes).toHaveLength(2)
  })

  it('stops before the round review if it could cross the cap', async () => {
    const { run, events, calls } = deps({ momentCost: RUN_BUDGET_USD - 0.05 })
    await run.run(1)
    await run.reviewRound()
    expect(calls).not.toContain('/api/coach-flow/round-review')
    expect(events.find(e => e.step === 'round-review')?.state).toBe('skipped')
  })

  it('still gives the data report when the match has no cloud recording', async () => {
    const { run, events, calls } = deps({ noUrl: true })
    await run.run(1)
    expect(calls).toContain('/api/match-report')
    expect(calls).not.toContain('/api/coach-flow/moment')
    expect(events.find(e => e.step === 'clips')?.state).toBe('skipped')
  })
})

describe('temp dir helper', () => {
  it('can create a temp dir (sanity for the clip folder)', async () => {
    const d = await mkdtemp(join(tmpdir(), 'cfd-'))
    expect(d).toContain('cfd-')
  })
})

describe('still times', () => {
  it('picks the evidence time inside the window, else the middle', () => {
    expect(decisiveVideoMs({ window_start_ms: 1000, window_end_ms: 9000 }, [{ evidence_ms: [5000] }])).toBe(5000)
    expect(decisiveVideoMs({ window_start_ms: 1000, window_end_ms: 9000 }, [{ evidence_ms: [20000] }])).toBe(5000)
  })
  it('keeps evidence first, adds window middles, at most five, in time order', () => {
    const w = [{ window_start_ms: 0, window_end_ms: 10_000 }, { window_start_ms: 20_000, window_end_ms: 30_000 }]
    expect(roundStillTimes(w, [{ evidence_ms: [2000] }, { evidence_ms: [2500] }])).toEqual([2000, 5000, 25000])
  })
})

describe('cache', () => {
  it('keeps the cache folder after the run is disposed and replays it at $0', async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), 'cf-cache-'))
    const { run } = makeRun({ cacheDir })
    await run.run(1)
    await run.reviewRound()
    await run.dispose()
    const files = await readdir(join(cacheDir, '1'))
    expect(files).toEqual(expect.arrayContaining(['events.json', 'moment-r7.mp4']))
    expect(existsSync(join(cacheDir, '1', 'events.json'))).toBe(true)

    const cached = await readCachedRun(cacheDir, 1)
    expect(cached?.events.some(e => e.phase === 'round' && e.step === 'round-review')).toBe(true)
    const replayed: FlowEvent[] = []
    vi.useFakeTimers()
    const replay = new CoachFlowCachedReplay(cached!, e => replayed.push(e))
    await replay.run()
    vi.runAllTimers()
    expect(replayed.some(e => e.step === 'moment-1' && e.state === 'done')).toBe(true)
    expect(replayed.some(e => e.step === 'round-review')).toBe(false)
    await replay.reviewRound()
    vi.runAllTimers()
    vi.useRealTimers()
    expect(replayed.some(e => e.step === 'round-review' && e.state === 'done')).toBe(true)
    expect(await replay.clipBytes('moment-r7')).not.toBeNull()
    expect(await replay.clipBytes('../etc')).toBeNull()
  })
})
