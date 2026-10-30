import { describe, expect, it } from 'vitest'
import {
  durationLabel,
  personalBestLabel,
  practiceStatItems,
  practiceTitle,
  sessionMinutes,
  showRecommended,
} from './practice-v3'

describe('practiceStatItems', () => {
  it('shows a dash for no streak and hides the weekly comparison when there is none', () => {
    const items = practiceStatItems({ streak: 0, thisWeekCount: 1, improvement: null, totalSessions: 4, comparisonLabel: 'No matching runs' })
    expect(items.map(i => i.value)).toEqual(['—', '1', '4'])
    expect(items[1].label).toBe('session this week')
  })

  it('colours the weekly change by direction', () => {
    const up = practiceStatItems({ streak: 3, thisWeekCount: 5, improvement: 4, totalSessions: 20, comparisonLabel: 'Flick · medium · 60s' })
    expect(up[2]).toMatchObject({ value: '+4', tone: 'win', title: 'Matched runs: Flick · medium · 60s' })
    const down = practiceStatItems({ streak: 3, thisWeekCount: 5, improvement: -2, totalSessions: 20, comparisonLabel: 'x' })
    expect(down[2]).toMatchObject({ value: '-2', tone: 'loss' })
    const flat = practiceStatItems({ streak: 3, thisWeekCount: 5, improvement: 0, totalSessions: 20, comparisonLabel: 'x' })
    expect(flat[2].tone).toBeUndefined()
  })
})

describe('labels', () => {
  it('titles the train tab as Practice and others by name', () => {
    expect(practiceTitle('train')).toBe('Practice')
    expect(practiceTitle('leaderboards')).toBe('Leaderboards')
  })
  it('formats durations and personal bests without inventing values', () => {
    expect(durationLabel(60)).toBe('1 min')
    expect(durationLabel(45)).toBe('45 s')
    expect(durationLabel(0)).toBe('')
    expect(personalBestLabel(71.6)).toBe('72')
    expect(personalBestLabel(null)).toBe('Not played')
  })
})

describe('session and recommendations', () => {
  it('rounds the session length up to whole minutes', () => {
    expect(sessionMinutes([])).toBeNull()
    expect(sessionMinutes([{ phaseLabel: 'Warm-up', scenario: 'flick', duration_seconds: 60 }, { phaseLabel: 'Focus', scenario: 'tracking', duration_seconds: 90 }])).toBe(3)
  })
  it('only shows recommended drills that came from the API', () => {
    expect(showRecommended(false, 3)).toBe(false)
    expect(showRecommended(true, 0)).toBe(false)
    expect(showRecommended(true, 2)).toBe(true)
  })
})
