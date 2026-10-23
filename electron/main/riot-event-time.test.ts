import { describe, expect, it } from 'vitest'
import { observedRoundStarts, riotGameTime } from './riot-event-time'

describe('observed Riot event clocks', () => {
  it('uses real gameTime when the other field is a zero placeholder', () => {
    expect(riotGameTime({ timeSinceGameStartMillis: 0, gameTime: 50_000 })).toBe(50_000)
    expect(observedRoundStarts([{ round: 0, timeSinceGameStartMillis: 0, gameTime: 50_000, roundTime: 20_000 }]).get(0)).toBe(30_000)
  })
  it('does not interpolate missing rounds or use contradictory clock pairs', () => {
    const starts = observedRoundStarts([
      { round: 0, gameTime: 50_000, roundTime: 20_000 },
      { round: 0, gameTime: 60_000, roundTime: 20_000 },
      { round: 2, gameTime: 200_000, roundTime: 10_000 },
    ])
    expect([...starts]).toEqual([[2, 190_000]])
  })
  it('rejects invalid or missing timestamps instead of making an event at zero', () => {
    expect(riotGameTime({ timeSinceGameStartMillis: NaN, gameTime: -1 })).toBeNull()
    expect(observedRoundStarts([{ round: 0, gameTime: 100, roundTime: 500 }]).size).toBe(0)
  })
})
