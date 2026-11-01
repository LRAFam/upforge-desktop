import { describe, expect, it, vi } from 'vitest'
import fixture from './valorant-timer-sync.fixture.json'
import {
  CROP_H, CROP_W, estimateOffset, findTicks, isTrustworthy, measureRoundTimerOffset, readTimer,
  type FrameReader,
} from './valorant-timer-sync'

// Mirrors riot-local-api: live Valorant timelines start with the default sync offset (-8000) already set.
vi.mock('./riot-local-api', () => ({
  manualSyncNudgeMs: (t: { videoSyncOffsetMs?: number }) => (t.videoSyncOffsetMs ?? -8000) - -8000,
  totalRecordingOffsetMs: (t: { videoSyncOffsetMs?: number; roundTimerOffsetMs?: number }) =>
    t.roundTimerOffsetMs != null ? t.roundTimerOffsetMs : (t.videoSyncOffsetMs ?? -8000),
  recomputeTimelineVideoOffsets: vi.fn(),
}))

const crop = (i: number) => Uint8Array.from(Buffer.from(fixture.frames[i]!, 'base64'))

describe('readTimer', () => {
  it('reads the round timer from real recording crops', () => {
    const got = fixture.frames.map((_, i) => readTimer(crop(i), fixture.width, fixture.height))
    expect(got).toEqual(fixture.expected)
  })

  it('returns null for a blank crop', () => {
    expect(readTimer(new Uint8Array(CROP_W * CROP_H), CROP_W, CROP_H)).toBeNull()
  })
})

describe('findTicks', () => {
  it('keeps clean one-second ticks in the combat phase only', () => {
    // 1:36 x3, 1:35 x4, unreadable, 1:34, then a buy-phase style 0:30 -> 0:29 that must be ignored
    const values = [96, 96, 96, 95, 95, 95, 95, null, 94, 30, 29, 29]
    expect(findTicks(values)).toEqual([{ frame: 2, shown: 95 }])
  })

  it('ignores a misread that jumps instead of ticking', () => {
    expect(findTicks([96, 96, 93, 95, 95])).toEqual([])
  })
})

describe('estimateOffset', () => {
  const starts = new Map([[1, 30_000], [2, 140_000]])

  it('turns ticks into the recording offset', () => {
    // Round 1 starts at game 30 s; the tick to 1:35 (5 s in) is seen 21 s into the recording -> offset -14 s.
    const e = estimateOffset([{ round: 1, videoMs: 21_000, shown: 95 }, { round: 2, videoMs: 131_000, shown: 95 }], starts)
    expect(e).toEqual({ offsetMs: -14_000, samples: 2, rounds: 2, spreadMs: 0, outliers: 0 })
  })

  it('ignores misreads and buy-phase values far from the agreeing group', () => {
    const good = [1, 1, 1, 2, 2, 2].map((round, i) => ({ round, videoMs: (round === 1 ? 21_000 : 131_000) + i * 3, shown: 95 }))
    const misread = { round: 1, videoMs: 21_000, shown: 32 }  // e.g. 0:32 read in a long buy phase
    const e = estimateOffset([...good, misread], starts)
    expect(Math.abs(e!.offsetMs - -14_000)).toBeLessThan(20)
    expect(e!.outliers).toBe(1)
    expect(isTrustworthy(e)).toBe(true)
  })

  it('trusts only several agreeing ticks from more than one round', () => {
    expect(isTrustworthy({ offsetMs: 0, samples: 10, rounds: 1, spreadMs: 0, outliers: 0 })).toBe(false)
    expect(isTrustworthy({ offsetMs: 0, samples: 10, rounds: 2, spreadMs: 400, outliers: 0 })).toBe(false)
    expect(isTrustworthy({ offsetMs: 0, samples: 10, rounds: 2, spreadMs: 20, outliers: 8 })).toBe(false)
    expect(isTrustworthy({ offsetMs: 0, samples: 10, rounds: 2, spreadMs: 20, outliers: 0 })).toBe(true)
  })
})

// A fake recording: each "frame" carries the timer value the screen would show at that moment.
function fakeRecording(trueOffsetMs: number, starts: Map<number, number>): FrameReader {
  return async (_path, startSec, durationSec) => {
    const frames: Uint8Array[] = []
    for (let i = 0; i < durationSec * 4; i++) {
      const gameMs = (startSec + (i + 0.5) / 4) * 1000 - trueOffsetMs
      const round = [...starts].find(([, s]) => gameMs >= s && gameMs < s + 100_000)
      // Timer shows the whole seconds remaining, rounded up (1:35 from 5.0 s to 6.0 s into the round).
      frames.push(Uint8Array.from([round ? Math.ceil(100 - (gameMs - round[1]) / 1000) : 255]))
    }
    return frames
  }
}
const decodeFake = (f: Uint8Array) => (f[0] === 255 ? null : f[0]!)

describe('measureRoundTimerOffset', () => {
  it('finds the true offset when the current guess is several seconds off', async () => {
    const starts = new Map([[1, 40_000], [2, 150_000], [3, 260_000]])
    const est = await measureRoundTimerOffset('rec.mp4', starts, -8000, fakeRecording(-13_375, starts), { decode: decodeFake })
    expect(isTrustworthy(est)).toBe(true)
    expect(Math.abs(est!.offsetMs - -13_375)).toBeLessThanOrEqual(250)  // 4 fps -> within a quarter second
  })
})

describe('alignValorantTimelineByRoundTimer', () => {
  const kills = (rounds: Array<[number, number]>) => rounds.map(([round, start]) => ({
    round, timeSinceGameStartMillis: start + 20_000, timeSinceRoundStartMillis: 20_000,
  }))

  type Timeline = import('./riot-types').MatchData
  // A live timeline as riot-local-api creates it: the default sync offset is already set.
  const live = (rounds: Array<[number, number]>, extra: Partial<Timeline> = {}) =>
    ({ killEvents: kills(rounds), videoSyncOffsetMs: -8000, ...extra }) as never as Timeline

  it('measures a live timeline that only has the default sync offset', async () => {
    const { alignValorantTimelineByRoundTimer } = await import('./valorant-timer-sync')
    const starts = new Map([[0, 40_000], [1, 150_000], [2, 260_000]])
    const timeline = live([[0, 40_000], [1, 150_000], [2, 260_000]])
    const est = await alignValorantTimelineByRoundTimer(timeline, 'rec.mp4', fakeRecording(-4875, starts), { info: vi.fn(), warn: vi.fn() }, decodeFake)
    expect(est).not.toBeNull()
    expect(Math.abs(timeline.roundTimerOffsetMs! - -4875)).toBeLessThanOrEqual(250)
    expect(timeline.videoSyncOffsetMs).toBe(-8000)  // the manual-nudge channel is untouched
  })

  it('leaves a recording alone when it was already measured or nudged by hand', async () => {
    const { alignValorantTimelineByRoundTimer } = await import('./valorant-timer-sync')
    const read = vi.fn(fakeRecording(0, new Map()))
    const measured = live([[0, 40_000], [1, 150_000]], { roundTimerOffsetMs: -9000 })
    const nudged = live([[0, 40_000], [1, 150_000]], { videoSyncOffsetMs: -6800 })
    expect(await alignValorantTimelineByRoundTimer(measured, 'rec.mp4', read, undefined, decodeFake)).toBeNull()
    expect(await alignValorantTimelineByRoundTimer(nudged, 'rec.mp4', read, undefined, decodeFake)).toBeNull()
    expect(read).not.toHaveBeenCalled()
    expect(measured.roundTimerOffsetMs).toBe(-9000)
    expect(nudged.roundTimerOffsetMs).toBeUndefined()
  })

  it('keeps the estimated offset when the timer cannot be read', async () => {
    const { alignValorantTimelineByRoundTimer } = await import('./valorant-timer-sync')
    const timeline = live([[0, 40_000], [1, 150_000]])
    expect(await alignValorantTimelineByRoundTimer(timeline, 'rec.mp4', async () => [], { info: vi.fn(), warn: vi.fn() }, decodeFake)).toBeNull()
    expect(timeline.roundTimerOffsetMs).toBeUndefined()
  })
})
