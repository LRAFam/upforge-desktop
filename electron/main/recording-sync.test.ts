import { describe, expect, it } from 'vitest'
import { cs2AlignedGameTimeMs, gameTimeToVideoOffsetMs, tickToMsFromTick } from './recording-sync'

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
