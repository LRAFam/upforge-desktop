import { describe, expect, it } from 'vitest'
import { liveEventsIndicateGameplay } from './live-gameplay-wait'

describe('liveEventsIndicateGameplay', () => {
  it('detects GameStart / RoundStart', () => {
    expect(liveEventsIndicateGameplay([{ EventName: 'GameStart', EventTime: 0 }])).toBe(true)
    expect(liveEventsIndicateGameplay([{ EventName: 'RoundStart', EventTime: 1 }])).toBe(true)
  })

  it('detects late EventTime as past load', () => {
    expect(liveEventsIndicateGameplay([{ EventName: 'Something', EventTime: 8 }])).toBe(true)
    expect(liveEventsIndicateGameplay([{ EventName: 'Something', EventTime: 2 }])).toBe(false)
  })

  it('returns false for empty', () => {
    expect(liveEventsIndicateGameplay([])).toBe(false)
    expect(liveEventsIndicateGameplay(null)).toBe(false)
  })
})
