import { afterEach, describe, expect, it, vi } from 'vitest'
import { DAILY_CHALLENGE_SETTINGS, dailyChallengeDone, dailyChallengeFor, type DailyChallenge } from './daily-challenge'
import { RADAR_SCENARIO_KEYS } from './trainer-scenarios'

afterEach(() => { vi.unstubAllEnvs() })

const runFor = (c: DailyChallenge, completedAt: Date, over: Record<string, unknown> = {}) => ({
  scenario: c.scenario, score: c.target, duration_seconds: 60, metadata: { difficulty: 'medium' }, completed_at: completedAt.toISOString(), ...over,
})

describe('daily challenge', () => {
  it('picks the same drill and target Practice shows today, at medium · 60 s', () => {
    const now = new Date(2026, 10, 18, 12, 0)
    const seed = 20261118
    const c = dailyChallengeFor(now, RADAR_SCENARIO_KEYS)
    expect(c.scenario).toBe(RADAR_SCENARIO_KEYS[seed % RADAR_SCENARIO_KEYS.length])
    expect(c.target).toBe([60, 65, 70, 75, 80][Math.floor(seed / 10) % 5])
    expect(c).toMatchObject({ ...DAILY_CHALLENGE_SETTINGS, day: '2026-11-18' })
    expect(DAILY_CHALLENGE_SETTINGS).toEqual({ difficulty: 'medium', duration_seconds: 60 })
  })

  it('only the run it asked for completes it: same drill, medium, 60 s, at or above the target', () => {
    const now = new Date(2026, 10, 18, 12, 0)
    const c = dailyChallengeFor(now, RADAR_SCENARIO_KEYS)
    const earlier = new Date(2026, 10, 18, 11, 0)
    expect(dailyChallengeDone(c, [runFor(c, earlier)])).toBe(true)
    expect(dailyChallengeDone(c, [runFor(c, earlier, { metadata: { difficulty: 'easy' } })])).toBe(false)
    expect(dailyChallengeDone(c, [runFor(c, earlier, { duration_seconds: 30 })])).toBe(false)
    expect(dailyChallengeDone(c, [runFor(c, earlier, { score: c.target - 1 })])).toBe(false)
    expect(dailyChallengeDone(c, [runFor(c, earlier, { scenario: 'not-this-drill' })])).toBe(false)
    expect(dailyChallengeDone(c, [runFor(c, earlier, { metadata: undefined })])).toBe(false)
  })

  it('uses the local day for choosing and checking, so it holds across midnight UTC', () => {
    vi.stubEnv('TZ', 'Pacific/Auckland') // UTC+13 in November: local morning is the previous day in UTC
    const morning = new Date(2026, 10, 18, 9, 0)
    expect(morning.toISOString().slice(0, 10)).toBe('2026-11-17')
    for (const now of [new Date(2026, 10, 18, 10, 0), new Date(2026, 10, 18, 14, 0), new Date(2026, 10, 18, 23, 59)]) {
      const c = dailyChallengeFor(now, RADAR_SCENARIO_KEYS)
      expect(c.day).toBe('2026-11-18')
      expect(dailyChallengeDone(c, [runFor(c, morning)]), now.toISOString()).toBe(true)
    }
    // Last night's run (same drill and score) is not today's.
    const c = dailyChallengeFor(new Date(2026, 10, 18, 10, 0), RADAR_SCENARIO_KEYS)
    expect(dailyChallengeDone(c, [runFor(c, new Date(2026, 10, 17, 23, 30))])).toBe(false)
  })

  it('reads trainer timestamps without an offset as UTC', () => {
    vi.stubEnv('TZ', 'UTC')
    const c = dailyChallengeFor(new Date(2026, 10, 18, 12, 0), RADAR_SCENARIO_KEYS)
    expect(dailyChallengeDone(c, [{ ...runFor(c, new Date()), completed_at: '2026-11-18T08:00:00' }])).toBe(true)
    expect(dailyChallengeDone(c, [{ ...runFor(c, new Date()), completed_at: '2026-11-17 23:00:00' }])).toBe(false)
  })
})
