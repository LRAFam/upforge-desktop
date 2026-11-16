import { describe, expect, it } from 'vitest'
import { averageAcs, newestPlayedFirst, playedTime, pooledKd, roundedMean, toMatchWon, winRatePct } from './match-stats'

describe('toMatchWon', () => {
  it('reads the 1/0 the recent-analyses endpoint sends for Riot-linked rows', () => {
    expect([1, 0, '1', '0', true, false].map(toMatchWon)).toEqual([true, false, true, false, true, false])
  })
  it('keeps unknown results unknown (never a loss)', () => {
    expect([null, undefined, 2, 'draw', ''].map(toMatchWon)).toEqual([null, null, null, null, null])
  })
})

describe('newestPlayedFirst', () => {
  it('orders by played_at, falling back to created_at, keeping API order on ties', () => {
    const rows = [
      { id: 'reanalysed-old', played_at: '2026-11-01T10:00:00Z', created_at: '2026-11-16T10:00:00Z' },
      { id: 'newest', played_at: '2026-11-15T20:00:00Z', created_at: '2026-11-15T21:00:00Z' },
      { id: 'no-played-at', played_at: null, created_at: '2026-11-14T09:00:00Z' },
    ]
    expect(newestPlayedFirst(rows).map(r => r.id)).toEqual(['newest', 'no-played-at', 'reanalysed-old'])
    expect(playedTime({ played_at: 'bad', created_at: null })).toBe(0)
  })
})

describe('winRatePct', () => {
  it('counts only matches with a known result', () => {
    expect(winRatePct([{ won: true }, { won: false }, { won: null }, { won: true }])).toBe(67)
  })
  it('is null (not 0%) when no match has a result', () => {
    expect(winRatePct([{ won: null }])).toBeNull()
  })
})

describe('pooledKd', () => {
  it('is total kills / total deaths, not the mean of per-match ratios', () => {
    // Per-match ratios 20/10 = 2.0 and 5/1 = 5.0 would average 3.5; the real K/D is 25/11.
    expect(pooledKd([{ kills: 20, deaths: 10 }, { kills: 5, deaths: 1 }, { kills: null, deaths: 3 }])).toBeCloseTo(25 / 11)
  })
  it('floors deaths at 1 and is null without stats', () => {
    expect(pooledKd([{ kills: 4, deaths: 0 }])).toBe(4)
    expect(pooledKd([{ kills: null, deaths: null }])).toBeNull()
  })
})

describe('averageAcs', () => {
  it('weights each match by its rounds (total score / total rounds)', () => {
    // 300 ACS over 13 rounds + 150 ACS over 26 rounds = 7800 / 39 = 200 (plain mean would say 225).
    expect(averageAcs([{ acs: 300, rounds: 13 }, { acs: 150, rounds: 26 }])).toBe(200)
  })
  it('falls back to the plain mean when a match has no round count, and skips matches without ACS', () => {
    expect(averageAcs([{ acs: 300, rounds: 13 }, { acs: 150, rounds: null }, { acs: null, rounds: 24 }])).toBe(225)
    expect(averageAcs([{ acs: null, rounds: 24 }])).toBeNull()
  })
})

describe('roundedMean', () => {
  it('ignores nulls instead of counting them as 0', () => {
    expect(roundedMean([20, null, 10, undefined, Number.NaN])).toBe(15)
    expect(roundedMean([])).toBeNull()
  })
})
