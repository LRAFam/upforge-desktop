import { describe, expect, it } from 'vitest'
import type { Cs2AnalysisItem } from '../env.d.ts'
import { cs2RatingTo100, cs2Rounds, cs2StatItems, cs2StatsSourceNote, mapCs2ToAnalysisItem, parseCs2Score } from './cs2-analyses'

const base: Cs2AnalysisItem = {
  id: 1, job_id: null, status: 'completed', player_name: 'LRAFam', map: 'de_vertigo',
  rounds_played: null, score: null, kd_ratio: 1.2, overall_rating: 7, created_at: '2026-07-10T10:00:00Z',
  completed_at: null, source: 'desktop_vod',
}

describe('mapCs2ToAnalysisItem', () => {
  it('keeps K/D/A and result the API sends', () => {
    const item = mapCs2ToAnalysisItem({ ...base, kills: 21, deaths: 14, assists: 5, won: true })
    expect([item.kills, item.deaths, item.assists, item.won]).toEqual([21, 14, 5, true])
  })

  it('puts the 1–10 coach rating on the shared 0–100 scale', () => {
    expect(mapCs2ToAnalysisItem(base).overall_score).toBe(70)
    expect(cs2RatingTo100(72)).toBe(72)
    expect(cs2RatingTo100(null)).toBeNull()
  })

  it('leaves missing stats as null', () => {
    const item = mapCs2ToAnalysisItem(base)
    expect([item.kills, item.won]).toEqual([null, null])
  })
})

describe('mapCs2ToAnalysisItem · UpForge score', () => {
  it('passes the stats score through untouched and keeps the coach rating separate', () => {
    const item = mapCs2ToAnalysisItem({ ...base, upforge_score: 588 })
    expect(item.upforge_score).toBe(588)
    expect(item.overall_score).toBe(70)
    expect(mapCs2ToAnalysisItem(base).upforge_score).toBeNull()
  })
})

describe('mapCs2ToAnalysisItem · round score', () => {
  it('reads the player-side score into rounds and a result when the API sent no result', () => {
    const item = mapCs2ToAnalysisItem({ ...base, score: '13-9' })
    expect([item.rounds_won, item.rounds_lost, item.won]).toEqual([13, 9, true])
    expect(mapCs2ToAnalysisItem({ ...base, score: '7–13' }).won).toBe(false)
  })

  it('keeps the API result over the score, and a draw stays unknown', () => {
    expect(mapCs2ToAnalysisItem({ ...base, score: '13-9', won: false }).won).toBe(false)
    expect(mapCs2ToAnalysisItem({ ...base, score: '12-12' }).won).toBeNull()
  })

  it('never reads an old side split as the score', () => {
    expect(parseCs2Score('CT 7 – T 9')).toBeNull()
    const item = mapCs2ToAnalysisItem({ ...base, score: 'CT 7 – T 9' })
    expect([item.rounds_won, item.won]).toEqual([null, null])
  })
})

describe('mapCs2ToAnalysisItem · VOD row stats (API 2 Nov 2026)', () => {
  const vod: Cs2AnalysisItem = {
    ...base, score: '13-10', rounds_played: 23, kills: 19, deaths: 15, assists: 0, won: true,
    rounds_won: 13, rounds_lost: 10, adr: 84.6, kast_pct: 71.4, headshot_pct: 48.2, stats_source: 'demo', overall_rating: 6.5,
  }

  it('shows the measured score, result, K/D/A, headshots, ADR and KAST', () => {
    const item = mapCs2ToAnalysisItem(vod)
    expect([item.rounds_won, item.rounds_lost, item.won]).toEqual([13, 10, true])
    expect([item.kills, item.deaths, item.assists, item.hs_pct]).toEqual([19, 15, 0, 48])
    expect(item.cs2_stats).toEqual({ adr: 84.6, kast_pct: 71, source: 'demo' })
    expect(item.overall_score).toBe(65)
    expect(cs2StatItems(item)).toEqual([{ value: '85', label: 'ADR' }, { value: '71%', label: 'KAST' }])
    expect(cs2StatsSourceNote(item)).toBeNull()
  })

  it('prefers rounds_won/lost over the score string, and derives the result from them', () => {
    const item = mapCs2ToAnalysisItem({ ...vod, score: '13-9', won: null, rounds_won: 10, rounds_lost: 13 })
    expect([item.rounds_won, item.rounds_lost, item.won]).toEqual([10, 13, false])
  })

  it('treats ADR 0 as not measured and labels AI-read numbers', () => {
    const item = mapCs2ToAnalysisItem({ ...vod, adr: 0, kast_pct: null, stats_source: 'ai' })
    expect(item.cs2_stats).toEqual({ adr: null, kast_pct: null, source: 'ai' })
    expect(cs2StatItems(item)).toEqual([])
    expect(cs2StatsSourceNote(item)).toMatch(/AI coach/)
  })

  it('older API rows (no new fields) keep the score-string fallback and no cs2_stats', () => {
    const item = mapCs2ToAnalysisItem({ ...base, score: '13-9' })
    expect([item.rounds_won, item.rounds_lost, item.won]).toEqual([13, 9, true])
    expect(item.cs2_stats).toBeUndefined()
    expect(item.hs_pct).toBeNull()
    expect(cs2Rounds({ score: null })).toBeNull()
  })
})
