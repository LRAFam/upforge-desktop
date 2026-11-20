import { describe, expect, it } from 'vitest'
import { accountAchievementsSave, readAccountAchievements } from './account-achievements'

describe('per-account achievement lists', () => {
  it('reads only this account', () => {
    const s = { achievementsByUser: { '1': { 'score-90': '2026-11-01T00:00:00.000Z' }, '2': { 'streak-3': '2026-11-02T00:00:00.000Z' } } }
    expect(readAccountAchievements(s, 2)).toEqual({ list: { 'streak-3': '2026-11-02T00:00:00.000Z' }, claimedLegacy: false })
    expect(readAccountAchievements(s, 3).list).toEqual({})
  })

  it('takes over the older PC-wide list and keeps the earlier date', () => {
    const s = {
      achievements: { 'first-drill': '2026-10-01T00:00:00.000Z', 'score-90': '2026-11-05T00:00:00.000Z' },
      achievementsByUser: { '1': { 'score-90': '2026-11-01T00:00:00.000Z' } },
    }
    const got = readAccountAchievements(s, 1)
    expect(got.claimedLegacy).toBe(true)
    expect(got.list).toEqual({ 'first-drill': '2026-10-01T00:00:00.000Z', 'score-90': '2026-11-01T00:00:00.000Z' })
  })

  it('ignores a damaged file', () => {
    expect(readAccountAchievements({ achievements: ['x'] as never, achievementsByUser: { '1': 5 as never } }, 1))
      .toEqual({ list: {}, claimedLegacy: false })
    expect(readAccountAchievements(null, 1)).toEqual({ list: {}, claimedLegacy: false })
  })

  it('saving one account keeps the others and clears the PC-wide list', () => {
    const s = { achievements: { 'first-drill': 'x' }, achievementsByUser: { '1': { a: 'x' } } }
    expect(accountAchievementsSave(s, 2, { b: 'y' })).toEqual({
      achievementsByUser: { '1': { a: 'x' }, '2': { b: 'y' } },
      achievements: {},
    })
  })
})
