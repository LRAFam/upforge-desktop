import { describe, expect, it } from 'vitest'
import { ACHIEVEMENTS } from '../composables/useAchievements'
import { ACHIEVEMENT_IDS, achievementResponse, mergeAchievementLists } from './achievement-sync'

describe('achievement API contract', () => {
  it('has exactly the UI achievement IDs', () => {
    expect([...ACHIEVEMENT_IDS].sort()).toEqual(ACHIEVEMENTS.map(a => a.id).sort())
  })
  it('keeps the earlier instant across timezone offsets and drops invalid local entries', () => {
    expect(mergeAchievementLists({ 'score-90': '2026-11-01T00:00:00Z', 'streak-3': 'broken' },
      { 'score-90': '2026-11-01T01:00:00+02:00', arbitrary: '2026-11-01' })).toEqual({ 'score-90': '2026-10-31T23:00:00.000Z' })
  })
  it('accepts the API row shape, not a fabricated empty success for malformed data', () => {
    expect(achievementResponse({ achievements: [{ id: 'first-drill', unlocked_at: '2026-11-01T00:00:00Z' }] }))
      .toEqual({ 'first-drill': '2026-11-01T00:00:00.000Z' })
    expect(() => achievementResponse({})).toThrow('Invalid achievement response')
    expect(() => achievementResponse({ achievements: [{ id: 'first-drill', unlocked_at: 'invalid' }] })).toThrow('Invalid achievement row')
  })
})
