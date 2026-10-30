import { describe, expect, it } from 'vitest'
import { rankHistoryInRange, type RankSnapshot } from './progress-chart'

const NOW = Date.parse('2026-10-30T12:00:00Z')
const day = (n: number): RankSnapshot => ({ date: new Date(NOW - n * 86_400_000).toISOString(), rank: 'Platinum 1', rr: 50, elo: 1500 + n })

describe('rankHistoryInRange', () => {
  it('keeps only points inside the range when there are at least two', () => {
    const r = rankHistoryInRange([day(300), day(20), day(5)], '30d', NOW)!
    expect(r.map(h => h.elo)).toEqual([1520, 1505])
  })
  it('borrows the last earlier point when the range holds one point', () => {
    const r = rankHistoryInRange([day(300), day(60), day(5)], '30d', NOW)!
    expect(r.map(h => h.elo)).toEqual([1560, 1505])
  })
  it('returns null when the range has no points', () => {
    expect(rankHistoryInRange([day(300), day(200)], '7d', NOW)).toBeNull()
  })
  it('returns everything for All', () => {
    expect(rankHistoryInRange([day(300), day(5)], 'all', NOW)).toHaveLength(2)
  })
})
