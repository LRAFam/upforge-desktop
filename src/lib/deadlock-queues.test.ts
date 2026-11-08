import { describe, expect, it } from 'vitest'
import { deadlockRank, type DeadlockRankPoint } from '../components/v3/games/game-data'
import {
  deadlockMatchWon, deadlockQueueOf, deadlockQueueStats, deadlockQueueTabs, deadlockSeasonView, defaultDeadlockQueue,
} from './deadlock-queues'

// deadlock-api match-history: match_mode 1 Standard, 4 Ranked; game_mode 4 Street Brawl. Player on team 0.
const m = (game_mode: number, match_mode: number, won: boolean, extra: Record<string, number> = {}) => ({
  game_mode, match_mode, player_team: 0, match_result: won ? 0 : 1, player_match_outcome: won ? 1 : 2,
  player_kills: 5, player_deaths: 2, player_assists: 5, ...extra,
})
const ranked = (won: boolean, extra = {}) => m(1, 4, won, extra)
const standard = (won: boolean, extra = {}) => m(1, 1, won, extra)
const brawl = (won: boolean) => m(4, 1, won)

describe('deadlockMatchWon', () => {
  it('reads the player result, not the winning team number', () => {
    // Team 1 won and the player is on team 1: a win, though match_result is 1 for both.
    expect(deadlockMatchWon({ match_result: 1, player_team: 1 })).toBe(true)
    expect(deadlockMatchWon({ match_result: 1, player_team: 0 })).toBe(false)
    expect(deadlockMatchWon({ player_match_outcome: 1, match_result: 1, player_team: 0 })).toBe(true)
    expect(deadlockMatchWon({})).toBeNull()
  })
})

describe('queues', () => {
  it('names each mode and prefers the API tag', () => {
    expect(deadlockQueueOf(ranked(true))).toBe('ranked')
    expect(deadlockQueueOf(standard(true))).toBe('standard')
    expect(deadlockQueueOf(brawl(true))).toBe('street_brawl')
    expect(deadlockQueueOf({ queue: 'standard', match_mode: 4 })).toBe('standard')
  })

  it('shows tabs only for queues played, with All when mixed, and defaults to Ranked', () => {
    const list = [brawl(true), standard(false), ranked(true), brawl(false)]
    expect(deadlockQueueTabs(list).map(t => `${t.key}:${t.count}`)).toEqual(['ranked:1', 'standard:1', 'street_brawl:2', 'all:4'])
    expect(defaultDeadlockQueue(list)).toBe('ranked')
    expect(defaultDeadlockQueue([brawl(true), brawl(true), standard(true)])).toBe('street_brawl')
    expect(deadlockQueueTabs([ranked(true)]).map(t => t.key)).toEqual(['ranked'])
  })

  it('gives each queue its own record and per-minute souls', () => {
    // The feedback case: a 45-minute loss with 49,500 souls vs a 25-minute stomp with 23,000.
    const list = [
      ranked(false, { net_worth: 49500, last_hits: 270, match_duration_s: 2700 }),
      ranked(true, { net_worth: 23000, last_hits: 150, match_duration_s: 1500 }),
      ranked(true, { net_worth: 900, match_duration_s: 120 }), // remake: left out of per-minute averages
      brawl(true), brawl(true),
    ]
    const items = deadlockQueueStats(list, 'ranked')
    expect(items[0]).toEqual({ value: '2–1', caption: 'Record', sub: 'Last 3 · Ranked' })
    expect(items.find(i => i.caption === 'Souls per minute')).toEqual({ value: '1010', caption: 'Souls per minute', sub: 'Average of 2 matches' })
    expect(items.find(i => i.caption === 'Soul orbs secured per minute')?.value).toBe('6.0')
    expect(deadlockQueueStats(list, 'street_brawl')[0].value).toBe('2–0')
    expect(deadlockQueueStats(list, 'all')[0].sub).toBe('Last 5 · all modes')
  })
})

describe('deadlockSeasonView', () => {
  const S2 = { name: 'Beta Season 2', start_time: 1_793_908_800 } // 5 Nov 2026
  const pt = (badge: number, at: number): DeadlockRankPoint => ({ ...deadlockRank(badge)!, at })
  const before = [pt(114, 1_793_000_000), pt(114, 1_793_500_000)]

  it('marks a reset instead of calling it a drop when the new season has one match', () => {
    const v = deadlockSeasonView([...before, pt(113, 1_794_000_000)], S2, 'Your rank is down from Oracle 4 to Oracle 3 since 27 Oct.')
    expect(v.markerAt).toBe(2)
    expect(v.tone).toBe('none')
    expect(v.sentence).toContain('Beta Season 2 started on 5 Nov')
    expect(v.sentence).not.toContain('down')
  })

  it('draws only this season once there are two matches in it', () => {
    const v = deadlockSeasonView([...before, pt(105, 1_794_000_000), pt(111, 1_794_100_000)], S2, '')
    expect(v.series).toHaveLength(2)
    expect(v.seasonOnly).toBe(true)
    expect(v.tone).toBe('win')
    expect(v.sentence).toMatch(/^Beta Season 2 started on 5 Nov\. Since then your rank is up from/)
  })

  it('says the line is last season when no ranked match has been played since the reset', () => {
    const v = deadlockSeasonView(before, S2, 'old')
    expect(v.sentence).toContain('from last season')
    expect(v.tone).toBe('none')
  })

  it('keeps the old view without a season or dates', () => {
    expect(deadlockSeasonView(before, null, 'old')).toMatchObject({ sentence: 'old', markerAt: null, seasonOnly: false })
  })
})
