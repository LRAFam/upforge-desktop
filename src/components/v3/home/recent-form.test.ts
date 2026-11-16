import { describe, expect, it } from 'vitest'
import type { AnalysisItem } from '../../../env.d.ts'
import { recentFormMatches, recentFormStats } from './recent-form'
import { displayAcs } from '../../../lib/dashboard-match-row'

let nextId = 1
function row(over: Partial<AnalysisItem> = {}): AnalysisItem {
  return {
    id: nextId++, job_id: null, status: 'completed', map: 'Ascent', agent: 'Jett', game_mode: 'competitive',
    won: null, kills: null, deaths: null, assists: null, kda: null, combat_score: null, overall_score: null,
    rounds_won: null, rounds_lost: null, hs_pct: null, rank: null, created_at: '2026-11-10T10:00:00Z', ...over,
  }
}

const stat = (items: ReturnType<typeof recentFormStats>, caption: string) => items.find(i => i.caption === caption)

describe('recentFormMatches', () => {
  it('takes the 5 newest played ranked matches, not the 5 newest analysed', () => {
    const old = row({ played_at: '2026-10-01T10:00:00Z', created_at: '2026-11-16T10:00:00Z' })
    const fresh = Array.from({ length: 5 }, (_, i) => row({ played_at: `2026-11-1${i}T10:00:00Z` }))
    const dm = row({ game_mode: 'deathmatch', played_at: '2026-11-16T09:00:00Z' })
    const picked = recentFormMatches([dm, old, ...fresh], 'valorant')
    expect(picked).toHaveLength(5)
    expect(picked).not.toContain(old)
    expect(picked).not.toContain(dm)
    expect(picked[0]).toBe(fresh[4])
  })
})

describe('recentFormStats (fixture)', () => {
  const list = [
    row({ won: true, rounds_won: 13, rounds_lost: 7, combat_score: 300, hs_pct: 30, upforge_score: 700 }),
    row({ won: false, rounds_won: 10, rounds_lost: 13, combat_score: 200, hs_pct: 20, upforge_score: null }),
    row({ won: 0 as unknown as boolean, rounds_won: 5, rounds_lost: 13, combat_score: 100, hs_pct: null, upforge_score: 400 }),
    row({ won: null, rounds_won: 13, rounds_lost: 13, combat_score: 4680, hs_pct: 10 }),
  ]
  const items = recentFormStats(list, { game: 'valorant', acs: displayAcs, coachRatingFallback: true })

  it('won–lost counts 1/0 results and leaves unknown out (1–2, not 1–3)', () => {
    expect(stat(items, 'Won–lost')).toMatchObject({ value: '1–2', sub: 'Last 4 analysed matches' })
  })
  it('average ACS is total score / total rounds (a stored total is turned into ACS first)', () => {
    // 300×20 + 200×23 + 100×18 + (4680/26=180)×26 = 6000+4600+1800+4680 = 17080 over 87 rounds = 196.
    expect(stat(items, 'Average ACS')?.value).toBe('196')
  })
  it('HS% is the mean of matches that have one (label says so)', () => {
    expect(stat(items, 'Headshots')).toMatchObject({ value: '20%', sub: 'Average across those matches' })
  })
  it('UpForge score averages scored matches only and says how many', () => {
    expect(stat(items, 'UpForge score')).toMatchObject({ value: '550', sub: 'Average of your last 2 scored matches' })
  })
  it('never shows 0–0 when no result is known', () => {
    const none = recentFormStats([row(), row()], { game: 'valorant', acs: displayAcs, coachRatingFallback: false })
    expect(none[0]).toMatchObject({ caption: 'Analysed', value: '2' })
  })
  it('CS2 K/D is total kills / total deaths', () => {
    const cs = recentFormStats([row({ kills: 20, deaths: 10, kda: 2 }), row({ kills: 5, deaths: 1, kda: 5 })], { game: 'cs2', acs: () => null, coachRatingFallback: false })
    expect(stat(cs, 'Average K/D')?.value).toBe((25 / 11).toFixed(2))
  })
})
