import { describe, expect, it } from 'vitest'
import { deriveRankShields, findProtectionField, isShieldTier, parseCompetitiveUpdates, parseValorantMmr, type CompetitiveUpdate } from './valorant-mmr'

// Tiers: Gold 1 = 12, Gold 2 = 13, Silver 3 = 11, Radiant = 27.
let t = 0
const u = (tierBefore: number, tierAfter: number, rrBefore: number, rrAfter: number, rrEarned: number): CompetitiveUpdate =>
  ({ matchId: `m${++t}`, startTime: t * 1000, tierBefore, tierAfter, rrBefore, rrAfter, rrEarned })

describe('isShieldTier', () => {
  it('is true only for Tier 1 divisions below Radiant', () => {
    expect([3, 6, 12, 24].every(isShieldTier)).toBe(true)
    expect([0, 2, 4, 5, 13, 26, 27].some(isShieldTier)).toBe(false)
  })
})

describe('deriveRankShields', () => {
  it('gives 2 shields on promotion into Tier 1', () => {
    expect(deriveRankShields([u(11, 11, 70, 90, 20), u(11, 12, 90, 10, 20)], 12)).toEqual({ certain: true, shields: 2 })
  })

  it('gives 2 shields on demotion into Tier 1', () => {
    expect(deriveRankShields([u(13, 12, 5, 80, -25)], 12)).toEqual({ certain: true, shields: 2 })
  })

  it('uses one shield per loss at 0 RR that keeps the rank', () => {
    const h = [u(11, 12, 90, 10, 20), u(12, 12, 10, 0, -15), u(12, 12, 0, 0, -18)]
    expect(deriveRankShields(h, 12)).toEqual({ certain: true, shields: 1 })
    expect(deriveRankShields([...h, u(12, 12, 0, 0, -20)], 12)).toEqual({ certain: true, shields: 0 })
  })

  it('does not refill on wins while staying in Tier 1', () => {
    const h = [u(11, 12, 90, 10, 20), u(12, 12, 10, 0, -15), u(12, 12, 0, 0, -18), u(12, 12, 0, 20, 20)]
    expect(deriveRankShields(h, 12)).toEqual({ certain: true, shields: 1 })
  })

  it('a derank after the last shield moves the player out, so Tier 1 no longer applies', () => {
    const h = [u(11, 12, 90, 10, 20), u(12, 12, 0, 0, -15), u(12, 12, 0, 0, -15), u(12, 11, 0, 80, -20)]
    expect(deriveRankShields(h, 11)).toEqual({ certain: false })
  })

  it('resets when the player leaves and re-enters Tier 1', () => {
    const h = [u(11, 12, 90, 10, 20), u(12, 12, 0, 0, -15), u(12, 13, 90, 5, 20), u(13, 12, 5, 80, -25)]
    expect(deriveRankShields(h, 12)).toEqual({ certain: true, shields: 2 })
  })

  it('is uncertain when the entry into this division is outside the window', () => {
    expect(deriveRankShields([u(12, 12, 10, 0, -15), u(12, 12, 0, 0, -15)], 12)).toEqual({ certain: false })
  })

  it('is uncertain with no history, a mismatched current tier, or inconsistent data', () => {
    expect(deriveRankShields(null, 12)).toEqual({ certain: false })
    expect(deriveRankShields([u(11, 12, 90, 10, 20)], 13)).toEqual({ certain: false })
    const tooManyProtected = [u(11, 12, 90, 10, 20), u(12, 12, 0, 0, -1), u(12, 12, 0, 0, -1), u(12, 12, 0, 0, -1)]
    expect(deriveRankShields(tooManyProtected, 12)).toEqual({ certain: false })
  })

  it('never reports shields for Radiant or non-Tier-1 divisions', () => {
    expect(deriveRankShields([u(26, 27, 90, 10, 20)], 27)).toEqual({ certain: false })
    expect(deriveRankShields([u(12, 13, 90, 10, 20)], 13)).toEqual({ certain: false })
  })
})

describe('parseCompetitiveUpdates', () => {
  const row = (i: number, over: Record<string, unknown> = {}) => ({
    MatchID: `m${i}`, MatchStartTime: i * 1000, TierBeforeUpdate: 11, TierAfterUpdate: 12,
    RankedRatingBeforeUpdate: 90, RankedRatingAfterUpdate: 10, RankedRatingEarned: 20, ...over,
  })
  it('reads rows and sorts them oldest first', () => {
    const rows = parseCompetitiveUpdates({ Matches: [row(2), row(1)] })!
    expect(rows.map(r => r.matchId)).toEqual(['m1', 'm2'])
  })
  it('returns null when any row is unreadable (the chain would be broken)', () => {
    expect(parseCompetitiveUpdates({ Matches: [row(1), row(2, { TierAfterUpdate: 'x' })] })).toBeNull()
    expect(parseCompetitiveUpdates(null)).toBeNull()
  })
})

describe('parseValorantMmr shields', () => {
  const ME = '11111111-2222-3333-4444-555555555555'
  const body = (tier: number, extra: Record<string, unknown> = {}) => ({
    Subject: ME, LatestCompetitiveUpdate: { MatchID: 'm2', TierAfterUpdate: tier, RankedRatingAfterUpdate: 10, RankedRatingEarned: 20, ...extra },
  })
  const updates = { Matches: [
    { MatchID: 'm1', MatchStartTime: 1, TierBeforeUpdate: 11, TierAfterUpdate: 11, RankedRatingBeforeUpdate: 70, RankedRatingAfterUpdate: 90, RankedRatingEarned: 20 },
    { MatchID: 'm2', MatchStartTime: 2, TierBeforeUpdate: 11, TierAfterUpdate: 12, RankedRatingBeforeUpdate: 90, RankedRatingAfterUpdate: 10, RankedRatingEarned: 20 },
  ] }
  it('derives shields from the history when certain', () => {
    expect(parseValorantMmr(body(12), ME, 0, updates)!.shields).toBe(2)
  })
  it('leaves shields null without history', () => {
    expect(parseValorantMmr(body(12), ME, 0)!.shields).toBeNull()
  })
  it('prefers a shield field Riot sends directly', () => {
    expect(findProtectionField(body(12, { RankShieldsRemaining: 1 }))).toEqual({ name: 'RankShieldsRemaining', value: 1 })
    expect(parseValorantMmr(body(12, { RankShieldsRemaining: 1 }), ME, 0, updates)!.shields).toBe(1)
  })
})
