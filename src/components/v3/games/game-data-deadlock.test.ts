import { describe, expect, it } from 'vitest'
import type { DeadlockProfileStats } from '../../../env.d.ts'
import { deadlockFarm, deadlockHeroRecord, deadlockRankCaption, deadlockRankSeries, deadlockStats, rankSentence } from './game-data'

const stats = (summary: Record<string, unknown>, recent: Array<Record<string, unknown>> = []) =>
  ({ summary, recent_matches: recent }) as unknown as DeadlockProfileStats

describe('deadlockStats', () => {
  it('adds average souls and percentiles only when the API sent them', () => {
    const items = deadlockStats(stats({ wins: 6, losses: 4, win_rate: 60, avg_kda: '3.1', avg_net_worth: 24304, percentiles: { kda: 27, net_worth: 10 } }))
    expect(items.find(i => i.caption === 'KDA')?.sub).toBe('Higher than 27% of players')
    expect(items.find(i => i.caption === 'Average souls')).toEqual({ value: '24.3k', caption: 'Average souls', sub: 'Higher than 10% of players' })
    const bare = deadlockStats(stats({ wins: 1, losses: 1, win_rate: 50, avg_kda: '2.0' }))
    expect(bare.map(i => i.caption)).toEqual(['Record', 'Win rate', 'KDA'])
    expect(bare[2].sub).toBeUndefined()
  })

  it('averages soul orbs secured and denied over matches that report them', () => {
    const s = stats({ wins: 1, losses: 1, win_rate: 50, avg_kda: '2' }, [
      { last_hits: 200, denies: 10 }, { last_hits: 101, denies: 5 }, { net_worth: 1 },
    ])
    expect(deadlockFarm(s)).toEqual({ lastHits: 151, denies: 8, deniedTotal: 15, matches: 2 })
    expect(deadlockStats(s).at(-1)).toEqual({ value: '151', caption: 'Soul orbs secured per match', sub: '15 denied in 2 matches' })
    expect(deadlockFarm(stats({ wins: 0, losses: 0, win_rate: 0, avg_kda: '0' }))).toBeNull()
  })
})

describe('deadlockRankSeries', () => {
  it('orders undated rows by match id, oldest first', () => {
    const s = deadlockRankSeries([{ rank: 31, match_id: 30 }, { rank: 25, match_id: 10 }, { rank: 26, match_id: 20 }] as never)
    expect(s.map(p => p.badge ?? p)).toHaveLength(3)
    expect(s[0]).toEqual(deadlockRankSeries([{ rank: 25 }])[0])
    expect(s[2]).toEqual(deadlockRankSeries([{ rank: 31 }])[0])
  })

  it('sorts dated mmr history by time whatever order it arrives in', () => {
    const s = deadlockRankSeries([{ rank: 25, start_time: 300 }, { rank: 31, start_time: 900 }, { rank: 26, start_time: 600 }])
    expect(s.map(p => p.badge)).toEqual([25, 26, 31])
    expect(s[0].at).toBe(300)
  })

  it('falls back to the rank badge on recent matches when mmr history is empty', () => {
    const s = deadlockRankSeries([], [
      { ranked_display_badge: 42, start_time: 1782243833 }, { ranked_display_badge: null, start_time: 1782200000 },
      { ranked_display_badge: 41, start_time: 1782130525 },
    ])
    expect(s.map(p => p.label)).toEqual(['Arcanist 1', 'Arcanist 2'])
    expect(rankSentence(s)).toMatch(/^Your rank is up from Arcanist 1 to Arcanist 2 since \d{1,2} \w{3}\.$/)
  })

  it('keeps the old newest-first reading for undated history', () => {
    expect(deadlockRankSeries([{ rank: 31 }, { rank: 25 }]).map(p => p.badge)).toEqual([25, 31])
  })
})

describe('deadlock labels', () => {
  it('shows a rare deny as a count, not a rounded 0 average', () => {
    const s = stats({ wins: 2, losses: 2, win_rate: 50, avg_kda: '0.92' }, [
      { last_hits: 72, denies: 0 }, { last_hits: 50, denies: 1 }, { last_hits: 71, denies: 0 }, { last_hits: 136, denies: 0 },
    ])
    expect(deadlockStats(s).at(-1)?.sub).toBe('1 denied in 4 matches')
  })

  it('writes most played heroes as wins–losses', () => {
    const s = { hero_stats: [
      { hero_id: 1, hero_name: 'Haze', matches_played: 3, win_rate: 66.7 },
      { hero_id: 2, hero_name: 'Viscous', matches_played: 1, win_rate: 0 },
      { hero_id: 3, hero_name: 'Nobody', matches_played: 0, win_rate: 0 },
    ] } as unknown as DeadlockProfileStats
    expect(deadlockHeroRecord(s)).toBe('Haze 2–1 · Viscous 0–1')
    expect(deadlockHeroRecord(null)).toBe('')
  })

  it('calls Obscurus unranked', () => {
    expect(deadlockRankCaption({ name: 'Obscurus', tier: 0 })).toMatch(/^Unranked/)
    expect(deadlockRankCaption({ name: 'Arcanist', tier: 4 })).toBe('Current rank')
    expect(deadlockRankCaption(null)).toBe('Current rank')
  })
})
