import { describe, expect, it } from 'vitest'
import { PERSONAL_MIN_SAMPLES, afterTwoLosses, sessionCoach, splitSessions } from './session-coach'

const H = 60 * 60_000
const g = (t: number, rr: number) => ({ startTime: t, rrEarned: rr })

describe('session coach', () => {
  it('splits sessions on a two-hour gap', () => {
    expect(splitSessions([g(0, 10), g(H, -10), g(4 * H, 5)]).map(s => s.length)).toEqual([2, 1])
  })

  it('says nothing for one loss, an old session or a win at the end', () => {
    const now = 10 * H
    expect(sessionCoach([g(now - H, 10), g(now - 0.5 * H, -15)], now)).toBeNull()
    expect(sessionCoach([g(now - 6 * H, -15), g(now - 5.5 * H, -15)], now)).toBeNull()
    expect(sessionCoach([g(now - H, -15), g(now - 0.5 * H, 20)], now)).toBeNull()
  })

  it('gives a neutral suggestion without enough history, in whole numbers', () => {
    const now = 10 * H
    const c = sessionCoach([g(now - 1.2 * H, -15), g(now - 0.6 * H, -18), g(now - 0.1 * H, -20)], now)!
    expect(c.lossStreak).toBe(3)
    expect(c.headline).toBe('3 losses in a row this session.')
    expect(c.personal).toBe(false)
    expect(c.detail).not.toMatch(/\d+\.\d/)
  })

  it('uses the player\'s own pattern once there are enough samples', () => {
    const games: Array<{ startTime: number; rrEarned: number }> = []
    let t = 0
    // 12 past sessions: two wins, loss, loss, then the next game (3 wins, 9 losses).
    for (let s = 0; s < 12; s++) {
      games.push(g(t - H, 15), g(t - 0.5 * H, 15), g(t, -10), g(t + 0.5 * H, -10), g(t + H, s < 3 ? 15 : -10))
      t += 24 * H
    }
    expect(afterTwoLosses(games).games).toBeGreaterThanOrEqual(PERSONAL_MIN_SAMPLES)
    const now = t + 2 * H
    games.push(g(now - H, -10), g(now - 0.5 * H, -12))
    const c = sessionCoach(games, now)!
    expect(c.personal).toBe(true)
    expect(c.detail).toMatch(/^After two losses in a row you've won \d+ of your next \d+ games, against \d+ of \d+ overall\./)
    expect(c.detail).toContain('A short break')
  })
})
