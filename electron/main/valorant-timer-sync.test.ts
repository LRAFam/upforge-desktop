import { describe, expect, it, vi } from 'vitest'
import fixture from './valorant-timer-sync.fixture.json'
import {
  CROP_H, CROP_W, estimateOffset, findTicks, isTrustworthy, measureRoundTimerOffset, readTimer,
  type FrameReader,
} from './valorant-timer-sync'

vi.mock('./riot-local-api', () => ({
  totalRecordingOffsetMs: (t: { videoSyncOffsetMs?: number }) => -8000 + (t.videoSyncOffsetMs ?? 0),
  nudgeTimelineSyncOffset: (t: { videoSyncOffsetMs?: number }, delta: number) => {
    t.videoSyncOffsetMs = (t.videoSyncOffsetMs ?? 0) + delta
  },
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
    expect(e).toEqual({ offsetMs: -14_000, samples: 2, rounds: 2, spreadMs: 0 })
  })

  it('trusts only several agreeing ticks from more than one round', () => {
    expect(isTrustworthy({ offsetMs: 0, samples: 10, rounds: 1, spreadMs: 0 })).toBe(false)
    expect(isTrustworthy({ offsetMs: 0, samples: 10, rounds: 2, spreadMs: 400 })).toBe(false)
    expect(isTrustworthy({ offsetMs: 0, samples: 10, rounds: 2, spreadMs: 20 })).toBe(true)
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

  it('stores the measured offset as the sync offset', async () => {
    const { alignValorantTimelineByRoundTimer } = await import('./valorant-timer-sync')
    const starts = new Map([[0, 40_000], [1, 150_000], [2, 260_000]])
    const timeline = { killEvents: kills([[0, 40_000], [1, 150_000], [2, 260_000]]) } as never as import('./riot-types').MatchData
    const log = { info: vi.fn(), warn: vi.fn() }
    const est = await alignValorantTimelineByRoundTimer(timeline, 'rec.mp4', fakeRecording(-4875, starts), log, decodeFake)
    expect(est).not.toBeNull()
    // mocked total = -8000 + videoSyncOffsetMs
    expect(Math.abs(-8000 + timeline.videoSyncOffsetMs! - -4875)).toBeLessThanOrEqual(250)
    expect(timeline.videoSyncSource).toBe('round_timer')
  })

  it('leaves a timeline alone when it was already synced or nudged by hand', async () => {
    const { alignValorantTimelineByRoundTimer } = await import('./valorant-timer-sync')
    const timeline = { killEvents: kills([[0, 40_000], [1, 150_000]]), videoSyncOffsetMs: 1200 } as never as import('./riot-types').MatchData
    expect(await alignValorantTimelineByRoundTimer(timeline, 'rec.mp4', fakeRecording(0, new Map()), undefined, decodeFake)).toBeNull()
    expect(timeline.videoSyncOffsetMs).toBe(1200)
  })

  it('keeps the old offset when the timer cannot be read', async () => {
    const { alignValorantTimelineByRoundTimer } = await import('./valorant-timer-sync')
    const timeline = { killEvents: kills([[0, 40_000], [1, 150_000]]) } as never as import('./riot-types').MatchData
    const log = { info: vi.fn(), warn: vi.fn() }
    expect(await alignValorantTimelineByRoundTimer(timeline, 'rec.mp4', async () => [], log, decodeFake)).toBeNull()
    expect(timeline.videoSyncOffsetMs).toBeUndefined()
  })
})
