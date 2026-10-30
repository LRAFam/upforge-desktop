import { describe, expect, it } from 'vitest'
import type { Focus } from '../focus'
import { focusShareLine, focusStreak, focusStreakAchievements, focusStreakLine } from './focus-streak'

const focus = (hits: boolean[], status = 'active'): Focus => ({
  id: 1, metric: 'first_deaths', label: 'First deaths', better: 'lower', baseline: 0.3, target: 0.2,
  checks: hits.map((hit, i) => ({ match_id: `m${i}`, value: 0.1, hit, played_at: null })),
  progress: { games_played: hits.length, hits: hits.filter(Boolean).length, games_required: 5, hits_required: 3, status },
  started_at: null, completed_at: null,
})

describe('focus streak', () => {
  it('counts trailing hits only', () => {
    expect(focusStreak(focus([true, false, true, true]))).toBe(2)
    expect(focusStreak(focus([true, true, true]))).toBe(3)
    expect(focusStreak(focus([true, false]))).toBe(0)
    expect(focusStreak(null)).toBe(0)
  })
  it('only shows a line from two games and unlocks badges at 3 and 5', () => {
    expect(focusStreakLine(1)).toBeNull()
    expect(focusStreakLine(3)).toBe('3 games in a row on target.')
    expect(focusStreakAchievements(2)).toEqual([])
    expect(focusStreakAchievements(5)).toEqual(['focus-streak-3', 'focus-streak-5'])
  })
  it('shares only an active focus', () => {
    expect(focusShareLine(focus([]))).toBe('Working on: first deaths under 20% in Valorant (with UpForge).')
    expect(focusShareLine(focus([], 'achieved'))).toBeNull()
  })
})
