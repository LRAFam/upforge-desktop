import { describe, expect, it } from 'vitest'
import { leagueDivisionName, rankForecast, valorantDivisionName } from './rank-forecast'

const DAY = 86_400_000
const climb = (n: number, days: number, start: number, perDay: number, noise = 0) =>
  Array.from({ length: n }, (_, i) => {
    const d = (days * i) / (n - 1)
    return { t: d * DAY, value: start + perDay * d + (i % 2 ? noise : -noise) }
  })

describe('rank forecast', () => {
  it('names Valorant and League divisions', () => {
    expect(valorantDivisionName(0)).toBe('Iron 1')
    expect(valorantDivisionName(1000)).toBe('Gold 2')
    expect(valorantDivisionName(2400)).toBeNull()
    expect(leagueDivisionName(1300)).toBe('Gold III')
    expect(leagueDivisionName(1500)).toBe('Gold I')
    expect(leagueDivisionName(2800)).toBe('Master')
  })

  it('needs 20 points over 14 days', () => {
    expect(rankForecast(climb(19, 30, 900, 5), 100, valorantDivisionName)).toBeNull()
    expect(rankForecast(climb(25, 10, 900, 5), 100, valorantDivisionName)).toBeNull()
  })

  it('gives a range toward the next division when the trend is clearly up', () => {
    const f = rankForecast(climb(30, 28, 900, 2, 6), 100, valorantDivisionName)!
    expect(f.target).toBe('Gold 2')
    expect(f.minWeeks).toBeLessThanOrEqual(f.maxWeeks)
    expect(f.sentence).toMatch(/^At this pace, Gold 2 in about \d+(–\d+)? weeks?\.$/)
  })

  it('stays quiet on a flat or falling trend', () => {
    expect(rankForecast(climb(30, 28, 950, 0, 20), 100, valorantDivisionName)).toBeNull()
    expect(rankForecast(climb(30, 28, 950, -3), 100, valorantDivisionName)).toBeNull()
  })
})
