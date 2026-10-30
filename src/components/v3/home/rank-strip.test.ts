import { describe, expect, it } from 'vitest'
import { ago, rankStripView, shieldLabel, type LiveRank } from './rank-strip'

const NOW = 1_800_000_000_000
const live = (over: Partial<LiveRank> = {}): LiveRank => ({
  tier: 13, tierName: 'Gold 2', rr: 47, lastChange: 18, placementsLeft: 0, state: 'ranked', fetchedAt: NOW - 120_000, ...over,
})

describe('rankStripView', () => {
  it('shows rank, RR bar and the last change in whole numbers', () => {
    expect(rankStripView(live(), null, NOW)).toMatchObject({
      kind: 'ranked', rankName: 'Gold 2', rr: 47, rrPct: 47, change: '+18 RR', changeTone: 'win', freshness: 'Updated 2 min ago', stale: false,
    })
    expect(rankStripView(live({ lastChange: -15 }), null, NOW)).toMatchObject({ change: '−15 RR', changeTone: 'loss' })
  })

  it('caps the bar at 100 for Immortal/Radiant RR', () => {
    expect(rankStripView(live({ tierName: 'Radiant', rr: 512 }), null, NOW)?.rrPct).toBe(100)
  })

  it('says when the saved rank is old and how to refresh it', () => {
    expect(rankStripView(live({ fetchedAt: NOW - 3 * 3_600_000 }), null, NOW)).toMatchObject({
      stale: true, freshness: 'Last seen 3h ago · open Valorant to refresh',
    })
  })

  it('shows placements and unranked honestly, without RR', () => {
    expect(rankStripView(live({ state: 'placements', placementsLeft: 3, rr: null }), null, NOW)).toMatchObject({
      kind: 'placements', rr: null, rrPct: null, freshness: '3 placement games left · Updated 2 min ago',
    })
    expect(rankStripView(live({ state: 'placements', placementsLeft: 1 }), null, NOW)?.freshness).toBe('1 placement game left · Updated 2 min ago')
    expect(rankStripView(live({ state: 'unranked', rr: null }), null, NOW)).toMatchObject({ kind: 'unranked', rankName: 'Unranked' })
  })

  it('falls back to the last synced snapshot, marked as stale', () => {
    const v = rankStripView(null, { date: new Date(NOW - 2 * 86_400_000).toISOString(), rank: 'Gold 1', rr: 20 }, NOW)
    expect(v).toMatchObject({ rankName: 'Gold 1', rr: 20, stale: true, freshness: 'From your last synced match, 2 days ago · open Valorant to refresh' })
  })

  it('shows nothing when there is no rank at all', () => {
    expect(rankStripView(null, null, NOW)).toBeNull()
    expect(rankStripView(null, { date: 'x', rank: null, rr: null }, NOW)).toBeNull()
  })

  it('formats ages', () => {
    expect(ago(10_000)).toBe('just now')
    expect(ago(86_400_000)).toBe('1 day ago')
  })
})

describe('rank shields on the strip', () => {
  const base = { tier: 12, tierName: 'Gold 1', rr: 10, lastChange: 20, placementsLeft: 0, state: 'ranked' as const, fetchedAt: 0 }
  it('uses whole-number copy', () => {
    expect(shieldLabel(2)).toBe('2 rank shields')
    expect(shieldLabel(1)).toBe('1 rank shield')
    expect(shieldLabel(0)).toBe('No rank shields left')
    expect(shieldLabel(null)).toBeNull()
    expect(shieldLabel(1.5)).toBeNull()
  })
  it('shows shields only when the count is known', () => {
    expect(rankStripView({ ...base, shields: 1 }, null, 0)!.shields).toBe('1 rank shield')
    expect(rankStripView({ ...base, shields: null }, null, 0)!.shields).toBeNull()
    expect(rankStripView(base, null, 0)!.shields).toBeNull()
  })
})
