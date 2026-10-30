import { describe, expect, it, vi } from 'vitest'
import {
  linkReviewTimeline, parseReviewStatus, pollDeadlockReplayReview, reviewPollDelayMs,
  startDeadlockReplayReview, REVIEW_MAX_POLLS, type DeadlockReviewRecording,
} from './deadlock-review'

const rec = (over: Partial<DeadlockReviewRecording> = {}): DeadlockReviewRecording => ({
  id: 'r1', game: 'deadlock', recordedAt: 1_000_000, timeline: null, ...over,
})
const events = [
  { type: 'kill' as const, time_seconds: 120, attacker_hero: 'Haze', victim_hero: 'Abrams' },
  { type: 'death' as const, time_seconds: 300, attacker_hero: 'Abrams', victim_hero: 'Haze' },
]

describe('startDeadlockReplayReview', () => {
  it('finds the replay, uploads it once and stores the job on the recording', async () => {
    const setJob = vi.fn(() => true)
    const upload = vi.fn(async () => ({ ok: true as const, jobId: 'job-12345678' }))
    const out = await startDeadlockReplayReview({ getRecording: () => rec(), findReplay: async () => '/replays/a.dem', upload, setJob }, 'r1')
    expect(out).toEqual({ ok: true, jobId: 'job-12345678' })
    expect(upload).toHaveBeenCalledWith('/replays/a.dem')
    expect(setJob).toHaveBeenCalledWith('r1', 'job-12345678')
  })

  it('never uploads (or spends a credit) twice for a recording that already has a review', async () => {
    const upload = vi.fn()
    const out = await startDeadlockReplayReview({ getRecording: () => rec({ deadlockReviewJobId: 'job-existing1' }), findReplay: async () => '/x.dem', upload, setJob: vi.fn() }, 'r1')
    expect(out).toEqual({ ok: true, jobId: 'job-existing1' })
    expect(upload).not.toHaveBeenCalled()
  })

  it('refuses other games and explains a missing replay without uploading', async () => {
    const upload = vi.fn()
    expect((await startDeadlockReplayReview({ getRecording: () => rec({ game: 'cs2' }), findReplay: async () => '/x.dem', upload, setJob: vi.fn() }, 'r1')).ok).toBe(false)
    const none = await startDeadlockReplayReview({ getRecording: () => rec(), findReplay: async () => null, upload, setJob: vi.fn() }, 'r1')
    expect(none.ok).toBe(false)
    expect(upload).not.toHaveBeenCalled()
  })
})

describe('pollDeadlockReplayReview', () => {
  const base = (status: () => Promise<string>, detail = { match_stats: { kill_events: events }, hero: 'Haze' }) => {
    const current = rec({ deadlockReviewJobId: 'job-12345678' })
    return {
      getRecording: () => current,
      getStatus: async () => parseReviewStatus(await status()),
      getDetail: vi.fn(async () => detail),
      updateTimeline: vi.fn((_id: string, _t: unknown) => true),
      notify: vi.fn(),
      sleep: vi.fn(async () => {}),
    }
  }

  it('links the replay timeline once the review completes', async () => {
    const seq = ['pending', 'processing', 'completed']
    const deps = base(async () => seq.shift()!)
    expect(await pollDeadlockReplayReview(deps, 'r1')).toBe('linked')
    expect(deps.updateTimeline).toHaveBeenCalledOnce()
    const tl = deps.updateTimeline.mock.calls[0][1] as unknown as { playerKills: unknown[]; playerDeaths: unknown[] }
    expect(tl.playerKills).toHaveLength(1)
    expect(tl.playerDeaths).toHaveLength(1)
    expect(deps.notify).toHaveBeenCalledOnce()
    expect(deps.sleep).toHaveBeenCalledTimes(2)
  })

  it('stops after the poll cap', async () => {
    const deps = base(async () => 'processing')
    expect(await pollDeadlockReplayReview(deps, 'r1', { maxPolls: 999 })).toBe('gave_up')
    expect(deps.sleep).toHaveBeenCalledTimes(REVIEW_MAX_POLLS - 1)
  })

  it('stops on failure and keeps the timeline sparse when the review has no events', async () => {
    expect(await pollDeadlockReplayReview(base(async () => 'failed'), 'r1')).toBe('failed')
    const empty = base(async () => 'completed', { match_stats: { kill_events: [] }, hero: 'Haze' })
    expect(await pollDeadlockReplayReview(empty, 'r1')).toBe('no_events')
    expect(empty.updateTimeline).not.toHaveBeenCalled()
  })

  it('keeps what the recording already knew when merging', async () => {
    const updateTimeline = vi.fn((_id: string, _t: unknown) => true)
    const r = rec({ deadlockReviewJobId: 'job-12345678', timeline: { map: 'Cursed Apple', matchId: '42', recordingStartTime: 5 } as never })
    await linkReviewTimeline({ getDetail: async () => ({ match_stats: { kill_events: events } }), updateTimeline, notify: () => {} }, r, 'job-12345678')
    const tl = updateTimeline.mock.calls[0][1] as unknown as { map: string; playerKills: unknown[] }
    expect(tl.playerKills).toHaveLength(1)
    expect(tl.map).toBe('Cursed Apple')
  })
})

describe('helpers', () => {
  it('backs off and caps at 60 s', () => {
    expect(reviewPollDelayMs(0)).toBe(10_000)
    expect(reviewPollDelayMs(1)).toBe(15_000)
    expect(reviewPollDelayMs(10)).toBe(60_000)
  })
  it('maps unknown statuses safely', () => {
    expect(parseReviewStatus('completed')).toBe('completed')
    expect(parseReviewStatus('weird')).toBe('unknown')
    expect(parseReviewStatus(null)).toBe('unknown')
  })
})
