import { describe, expect, it } from 'vitest'
import { badgeIndexes, chartGeometry, habitTone, HABIT_METRICS, inRange, eloDelta, eloSeries, formatMetric, halfDelta, metricLabel, rankChanges, sparkline } from './progress-chart'

const snap = (date: string, rank: string | null, rr: number, elo: number) => ({ date, rank, rr, elo })

describe('eloSeries', () => {
  it('uses elo (never rr), sorts oldest first and drops unusable points', () => {
    const s = eloSeries([
      snap('2026-10-03', 'Gold 1', 5, 1205),
      snap('2026-10-01', 'Silver 3', 90, 1190),
      snap('2026-10-02', 'Silver 3', 95, 0),
      snap('not-a-date', 'Gold 1', 10, 1210),
    ])
    expect(s.map(p => p.elo)).toEqual([1190, 1205])
    expect(s[0].rank).toBe('Silver 3')
  })
})

describe('eloDelta and rankChanges', () => {
  it('measures the change across the window and finds rank changes', () => {
    const s = eloSeries([snap('2026-10-01', 'Silver 3', 90, 1190), snap('2026-10-02', 'Gold 1', 5, 1205), snap('2026-10-03', 'Gold 1', 30, 1230)])
    expect(eloDelta(s)).toBe(40)
    expect(rankChanges(s)).toEqual([{ index: 1, from: 'Silver 3', to: 'Gold 1', up: true }])
    expect(eloDelta(s.slice(0, 1))).toBeNull()
  })
})

describe('chartGeometry', () => {
  const box = { width: 400, height: 100, padX: 10, padTop: 10, padBottom: 10 }
  it('maps time to x and higher elo to a smaller y', () => {
    const s = eloSeries([snap('2026-10-01', null, 0, 1000), snap('2026-10-11', null, 0, 1100)])
    const g = chartGeometry(s, box)!
    expect(g.points[0].x).toBe(10)
    expect(g.points[1].x).toBe(390)
    expect(g.points[1].y).toBeLessThan(g.points[0].y)
    expect(g.area.endsWith('Z')).toBe(true)
    expect(g.min).toBeLessThan(1000)
    expect(g.max).toBeGreaterThan(1100)
  })
  it('keeps uneven time gaps honest', () => {
    const s = eloSeries([snap('2026-10-01', null, 0, 1000), snap('2026-10-02', null, 0, 1010), snap('2026-10-11', null, 0, 1020)])
    const g = chartGeometry(s, box)!
    expect(g.points[1].x).toBeCloseTo(10 + 380 / 10, 0)
  })
  it('needs at least two points', () => {
    expect(chartGeometry(eloSeries([snap('2026-10-01', null, 0, 1000)]), box)).toBeNull()
  })
})

describe('helpers', () => {
  it('halfDelta averages the first and second half', () => {
    expect(halfDelta([0.4, 0.3, 0.2, 0.1])).toEqual({ first: 0.35, last: 0.15000000000000002 })
    expect(halfDelta([0.4, null])).toBeNull()
  })
  it('sparkline spans the width', () => {
    expect(sparkline([1, 2, 3], 100, 20).split(' ')).toHaveLength(3)
    expect(sparkline([1], 100, 20)).toBe('')
  })
  it('labels and formats metrics', () => {
    expect(metricLabel('opening_death_rate')).toBe('Opening deaths')
    expect(metricLabel('some_new_rate')).toBe('Some new rate')
    expect(formatMetric('opening_death_rate', 0.364)).toBe('36%')
    expect(formatMetric('adr', 97.8)).toBe('97.8')
  })
})

describe('spacedByX', () => {
  it('drops crowded badges and always keeps the newest', async () => {
    const { spacedByX } = await import('./progress-chart')
    const xs = [10, 20, 35, 100, 120, 300].map(x => ({ x }))
    expect(spacedByX(xs, 40).map(p => p.x)).toEqual([35, 120, 300])
    expect(spacedByX([], 40)).toEqual([])
  })
})

describe('habit direction', () => {
  it('knows which way is better for every metric the coach measures', () => {
    expect(Object.fromEntries(Object.entries(HABIT_METRICS).map(([k, v]) => [k, v.better]))).toEqual({
      opening_death_rate: 'lower',
      early_opening_death_rate: 'lower',
      traded_death_rate: 'higher', // share of your deaths a teammate traded: up is good
      zero_damage_round_rate: 'lower',
      headshot_hit_rate: 'higher',
      leg_hit_rate: 'lower',
    })
  })
  it('colours each change by that stat\'s direction (audit cases)', () => {
    expect(habitTone('early_opening_death_rate', 0.08, 0.04)).toBe('better')
    expect(habitTone('zero_damage_round_rate', 0.38, 0.33)).toBe('better')
    expect(habitTone('leg_hit_rate', 0.03, 0.06)).toBe('worse')
    expect(habitTone('traded_death_rate', 0.16, 0.20)).toBe('better')
    expect(habitTone('traded_death_rate', 0.20, 0.16)).toBe('worse')
    expect(habitTone('headshot_hit_rate', 0.30, 0.25)).toBe('worse')
  })
  it('is flat when the shown value does not change, and the focus direction wins', () => {
    expect(habitTone('opening_death_rate', 0.121, 0.118)).toBe('flat')
    expect(habitTone('mystery_rate', 0.1, 0.2)).toBeNull()
    expect(habitTone('mystery_rate', 0.1, 0.2, 'higher')).toBe('better')
  })
})

describe('badgeIndexes', () => {
  const pts = (ranks: Array<string | null>) => ranks.map((rank, i) => ({ t: i, elo: 1000 + i, rank }))
  it('badges the start and the first time each rank is reached, not every flip', () => {
    expect(badgeIndexes(pts(['P1', 'P2', 'P1', 'P2', 'P1', 'P2']))).toEqual([0, 1])
  })
  it('adds the end when the player finishes on an earlier rank', () => {
    expect(badgeIndexes(pts(['P1', 'P2', 'P1']))).toEqual([0, 1, 2])
    expect(badgeIndexes([])).toEqual([])
  })
})

describe('inRange', () => {
  const NOW = Date.parse('2026-11-02T12:00:00Z')
  const items = [{ d: '2026-10-30T00:00:00Z' }, { d: '2026-09-01T00:00:00Z' }, { d: null }]
  it('keeps dated items inside the range; All keeps everything', () => {
    expect(inRange(items, i => i.d, '7d', NOW)).toEqual([items[0]])
    expect(inRange(items, i => i.d, 'all', NOW)).toHaveLength(3)
  })
})
