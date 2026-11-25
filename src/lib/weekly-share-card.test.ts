import { describe, expect, it } from 'vitest'
import { weeklyShareCardData, type WeeklyCardRun } from './weekly-share-card'
import { currentScoringVersion } from './training-result-metrics'

const LABELS: Record<string, string> = { head_height: 'Head Height', gridshot: 'Gridshot', microflick: 'Micro Flick', strafe_track: 'Strafe Track' }
const label = (s: string) => LABELS[s] ?? s
const meta = { difficulty: 'medium', game: 'valorant' }
// Runs on the rules this app's trainer uses for each drill, unless a test says otherwise.
const run = (scenario: string, score: number, daysAgo: number, now: Date, difficulty = 'medium', scoring_version = currentScoringVersion(scenario)): WeeklyCardRun => ({
  scenario, score, duration_seconds: 60, metadata: { ...meta, difficulty, scoring_version },
  completed_at: new Date(now.getTime() - daysAgo * 86400000).toISOString(),
})

describe('weekly share card data', () => {
  // Wednesday 18 Nov 2026, midday local
  const now = new Date(2026, 10, 18, 12, 0, 0)
  const sessions = [
    run('head_height', 70, 0, now), run('head_height', 60, 1, now), run('head_height', 59, 2, now),
    run('gridshot', 81, 3, now), run('gridshot', 75, 4, now),
    run('microflick', 50, 5, now), run('microflick', 55, 5.5, now),
    run('strafe_track', 40, 6, now, 'easy'), run('gridshot', 66, 6, now),
    // Before the window: counted only in the previous-7-days comparison
    run('head_height', 50, 8, now), run('gridshot', 99, 9, now),
  ]
  const card = weeklyShareCardData(sessions, now, label)

  it('dates and run count use the same 7-day window', () => {
    expect(card.rangeLabel).toBe('12 Nov – 18 Nov 2026')
    expect(card.runCount).toBe(9)
  })

  it('lists every drill played with its proper name', () => {
    expect(card.drills).toEqual([
      { scenario: 'head_height', label: 'Head Height', count: 3 },
      { scenario: 'gridshot', label: 'Gridshot', count: 3 },
      { scenario: 'microflick', label: 'Micro Flick', count: 2 },
      { scenario: 'strafe_track', label: 'Strafe Track', count: 1 },
    ])
  })

  it('each number says what it covers', () => {
    expect(card.avg).toEqual({ value: 63, covers: 'Head Height · medium · 60s' })
    expect(card.vsPrevious).toBeNull() // Only one comparable run in the previous week.
    expect(card.best).toEqual({ value: 81, covers: 'Gridshot' })
  })

  it('never counts a run scored by older rules as the best, nor in the drill’s average', () => {
    const older = run('head_height', 95, 0.5, now, 'medium', 3)
    const withOlder = weeklyShareCardData([older, ...sessions], now, label)
    expect(withOlder.best).toEqual({ value: 81, covers: 'Gridshot' })
    expect(withOlder.avg).toEqual(card.avg)
    expect(withOlder.runCount).toBe(10)
  })

  it('is empty without runs in the window', () => {
    const empty = weeklyShareCardData([run('gridshot', 80, 10, now)], now, label)
    expect(empty).toMatchObject({ runCount: 0, avg: null, vsPrevious: null, best: null, drills: [] })
  })
})
