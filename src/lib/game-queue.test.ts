import { describe, expect, it } from 'vitest'
import { countsTowardProgress, modeQueueLabel, queueTypeFor } from './game-queue'

describe('game queue split', () => {
  it('CS2: Premier/Competitive are ranked; Wingman, Casual, DM, Arms Race are not counted', () => {
    expect(queueTypeFor('cs2', 'PREMIER')).toBe('ranked')
    expect(queueTypeFor('cs2', 'competitive')).toBe('ranked')
    for (const m of ['WINGMAN', 'wingman', 'CASUAL', 'DEATHMATCH', 'ARMS_RACE', 'CUSTOM']) {
      expect(queueTypeFor('cs2', m)).toBe('unranked')
      expect(countsTowardProgress('cs2', m)).toBe(false)
    }
  })

  it('Valorant: Competitive/Premier ranked; Swiftplay, Unrated, TDM, DM are not', () => {
    expect(countsTowardProgress('valorant', 'COMPETITIVE')).toBe(true)
    expect(countsTowardProgress('valorant', 'premier')).toBe(true)
    for (const m of ['SWIFTPLAY', 'CLASSIC', 'TEAMDEATHMATCH', 'DEATHMATCH', 'SPIKERUSH']) expect(countsTowardProgress('valorant', m)).toBe(false)
  })

  it('unknown modes still count (nothing silently disappears)', () => {
    expect(countsTowardProgress('cs2', null)).toBe(true)
    expect(countsTowardProgress('lol', 'CLASSIC')).toBe(true)
    expect(countsTowardProgress('deadlock', 'COMPETITIVE')).toBe(true)
  })

  it('labels rows truthfully', () => {
    expect(modeQueueLabel('cs2', 'WINGMAN')).toBe('Wingman · 2v2')
    expect(modeQueueLabel('cs2', 'PREMIER')).toBe('Premier · Ranked')
    expect(modeQueueLabel('cs2', 'deathmatch')).toBe('Deathmatch · Unranked')
    expect(modeQueueLabel('valorant', 'SWIFTPLAY')).toBe('Swiftplay · Unranked')
    expect(modeQueueLabel('valorant', 'CLASSIC')).toBe('Unrated')
    expect(modeQueueLabel('lol', 'ARAM')).toBe('')
    expect(modeQueueLabel('cs2', '')).toBe('')
  })
})
