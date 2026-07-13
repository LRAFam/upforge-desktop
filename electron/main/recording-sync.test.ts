import { describe, expect, it } from 'vitest'
import {
  cs2AlignedGameTimeMs,
  gameTimeToVideoOffsetMs,
  lolGameTimeToVideoOffsetMs,
  tickToMsFromTick,
} from './recording-sync'

describe('cs2AlignedGameTimeMs', () => {
  it('subtracts anchor tick at 64 tick/s', () => {
    expect(cs2AlignedGameTimeMs(8000, 1600, 64)).toBe(100_000)
    expect(tickToMsFromTick(6400, 64)).toBe(100_000)
  })

  it('never returns negative ms', () => {
    expect(cs2AlignedGameTimeMs(100, 5000, 64)).toBe(0)
  })
})

describe('gameTimeToVideoOffsetMs cs2', () => {
  it('subtracts recording lag from aligned game time', () => {
    const offset = gameTimeToVideoOffsetMs(100_000, {
      matchStartTime: 1_000,
      recordingStartTime: 6_000,
    })
    expect(offset).toBe(95_000)
  })
})

describe('lolGameTimeToVideoOffsetMs', () => {
  it('adds the loading-screen gap when recording started before game clock zero', () => {
    // Recording started 22s before the in-game clock read 0.
    const gameClockZeroEpoch = 1_700_000_000_000
    const recordingStartTime = gameClockZeroEpoch - 22_000
    // An event at 60s of game clock should land at 60s + 22s = 82s in the video.
    const offset = lolGameTimeToVideoOffsetMs(60_000, {
      gameClockZeroEpoch,
      recordingStartTime,
    })
    expect(offset).toBe(82_000)
  })

  it('clamps to zero when recording started after the event', () => {
    const gameClockZeroEpoch = 1_700_000_000_000
    // Recording started 10s after game clock zero — a 5s event is already past.
    const recordingStartTime = gameClockZeroEpoch + 10_000
    const offset = lolGameTimeToVideoOffsetMs(5_000, {
      gameClockZeroEpoch,
      recordingStartTime,
    })
    expect(offset).toBe(0)
  })

  it('applies the manual sync nudge', () => {
    const gameClockZeroEpoch = 1_700_000_000_000
    const recordingStartTime = gameClockZeroEpoch - 20_000
    const offset = lolGameTimeToVideoOffsetMs(60_000, {
      gameClockZeroEpoch,
      recordingStartTime,
      syncOffset: -3_000,
    })
    // 60_000 + 20_000 - 3_000 = 77_000
    expect(offset).toBe(77_000)
  })

  it('falls back to raw game time when the clock-zero anchor is missing', () => {
    const offset = lolGameTimeToVideoOffsetMs(45_000, {
      gameClockZeroEpoch: null,
      recordingStartTime: null,
    })
    expect(offset).toBe(45_000)
  })
})
