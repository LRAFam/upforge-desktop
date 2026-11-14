import { describe, expect, it } from 'vitest'
import { DEADLOCK_TIERS, deadlockCurrentRankIconUrl, getDeadlockRankIconUrl } from './deadlock'
import { deadlockRank } from '../components/v3/games/game-data'

// Current ladder from deadlock-api /v1/assets/ranks (14 Nov 2026).
describe('Deadlock rank ladder', () => {
  it('matches the current ladder', () => {
    expect([...DEADLOCK_TIERS]).toEqual([
      'Obscurus', 'Initiate', 'Seeker', 'Acolyte', 'Sentinel', 'Mystic',
      'Ritualist', 'Emissary', 'Oracle', 'Phantom', 'Ascendant', 'Eternus',
    ])
  })

  it('decodes a tier-5 badge as Mystic', () => {
    expect(deadlockRank(53)).toMatchObject({ tier: 5, sub: 3, name: 'Mystic', label: 'Mystic 3' })
    expect(deadlockRank(74)?.label).toBe('Emissary 4')
  })

  it('has a badge for every current tier and none for retired names', () => {
    expect(getDeadlockRankIconUrl('Mystic', 3)).toMatch(/rank5-sub3\.webp$/)
    expect(getDeadlockRankIconUrl('Acolyte')).toMatch(/rank3-lg\.webp$/)
    expect(getDeadlockRankIconUrl('Sentinel', 1)).toMatch(/rank4-sub1\.webp$/)
    expect(getDeadlockRankIconUrl('Alchemist')).toBeNull()
    expect(getDeadlockRankIconUrl('Archon', 2)).toBeNull()
  })

  it('current rank: bundled badge, else the deadlock-api image, else Obscurus', () => {
    expect(deadlockCurrentRankIconUrl({ name: 'Mystic', subtier: 5, image: null })).toMatch(/rank5-sub5\.webp$/)
    const remote = 'https://assets-bucket.deadlock-api.com/assets-api-res/images/ranks/rank13_lg.webp'
    expect(deadlockCurrentRankIconUrl({ name: 'NewTier', subtier: null, image: remote })).toBe(remote)
    expect(deadlockCurrentRankIconUrl({ name: 'NewTier', subtier: null, image: 'https://evil.example/x.png' })).toMatch(/rank0-sm\.png$/)
    expect(deadlockCurrentRankIconUrl(null)).toMatch(/rank0-sm\.png$/)
  })
})
