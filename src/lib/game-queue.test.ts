import { describe, expect, it } from 'vitest'
import { analysisCountsTowardProgress, countsTowardProgress, modeQueueLabel, queueTypeFor } from './game-queue'

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

  it('Deadlock: only Ranked counts; Standard, Street Brawl, bots, lobbies and Hero Labs are kept out', () => {
    expect(queueTypeFor('deadlock', 'RANKED')).toBe('ranked')
    for (const m of ['UNRANKED', 'STREET_BRAWL', 'PRIVATE_LOBBY', 'COOP_BOT', 'HERO_LABS', 'TUTORIAL', 'NEW_PLAYER_PLACEMENT']) {
      expect(queueTypeFor('deadlock', m)).toBe('unranked')
      expect(countsTowardProgress('deadlock', m)).toBe(false)
    }
    // Placeholder before the match metadata arrives, and analyses' game marker: still counted.
    expect(countsTowardProgress('deadlock', 'COMPETITIVE')).toBe(true)
    expect(countsTowardProgress('deadlock', 'DEADLOCK')).toBe(true)
  })

  it('labels Deadlock rows by their real queue, nothing for the placeholder', () => {
    expect(modeQueueLabel('deadlock', 'RANKED')).toBe('Ranked')
    expect(modeQueueLabel('deadlock', 'UNRANKED')).toBe('Standard · Unranked')
    expect(modeQueueLabel('deadlock', 'STREET_BRAWL')).toBe('Street Brawl · Unranked')
    expect(modeQueueLabel('deadlock', 'PRIVATE_LOBBY')).toBe('Private lobby')
    expect(modeQueueLabel('deadlock', 'COOP_BOT')).toBe('Bot match')
    expect(modeQueueLabel('deadlock', 'HERO_LABS')).toBe('Hero Labs')
    expect(modeQueueLabel('deadlock', 'COMPETITIVE')).toBe('')
  })

  it('Deadlock analyses: only ranked (or unknown) queues count toward Progress and form', () => {
    expect(analysisCountsTowardProgress('deadlock', { game_mode: 'DEADLOCK', queue: 'ranked' })).toBe(true)
    expect(analysisCountsTowardProgress('deadlock', { game_mode: 'DEADLOCK', queue: null })).toBe(true)
    expect(analysisCountsTowardProgress('deadlock', { game_mode: 'DEADLOCK' })).toBe(true)
    for (const q of ['standard', 'street_brawl', 'other']) {
      expect(analysisCountsTowardProgress('deadlock', { game_mode: 'DEADLOCK', queue: q })).toBe(false)
    }
    // Other games still go by game_mode.
    expect(analysisCountsTowardProgress('cs2', { game_mode: 'WINGMAN' })).toBe(false)
    expect(analysisCountsTowardProgress('cs2', { game_mode: 'PREMIER' })).toBe(true)
  })
})
