import { describe, expect, it } from 'vitest'
import type { AnalysisItem } from '../../../env.d.ts'
import { breakdownRows, progressKd, progressMatches, progressWinRate } from './progress-stats'

let nextId = 1
function row(over: Partial<AnalysisItem> = {}): AnalysisItem {
  return {
    id: nextId++, job_id: null, status: 'completed', map: 'Ascent', agent: 'Jett', game_mode: 'competitive',
    won: null, kills: null, deaths: null, assists: null, kda: null, combat_score: null, overall_score: null,
    rounds_won: null, rounds_lost: null, hs_pct: null, rank: null, created_at: '2026-11-10T10:00:00Z', ...over,
  }
}
const NOW = Date.parse('2026-11-16T12:00:00Z')

describe('progressMatches', () => {
  it('counts a re-analysed match once and ranges by when it was played', () => {
    const rerun = row({ match_id: 'm1', played_at: '2026-11-15T10:00:00Z', created_at: '2026-11-16T10:00:00Z', won: true })
    const first = row({ match_id: 'm1', played_at: '2026-11-15T10:00:00Z', created_at: '2026-11-15T11:00:00Z', won: true })
    const oldPlayed = row({ match_id: 'm2', played_at: '2026-09-01T10:00:00Z', created_at: '2026-11-14T10:00:00Z' })
    const dm = row({ match_id: 'm3', game_mode: 'deathmatch', played_at: '2026-11-14T10:00:00Z' })
    const { counted, excluded } = progressMatches([rerun, first, oldPlayed, dm], 'valorant', '30d', NOW)
    expect(counted).toEqual([rerun])
    expect(excluded).toBe(1)
  })
})

describe('progressWinRate', () => {
  it('is null (shown as —) when no result is known, and ignores unknowns otherwise', () => {
    expect(progressWinRate([row(), row()])).toBeNull()
    expect(progressWinRate([row({ won: true }), row({ won: 0 as unknown as boolean }), row()])).toBe(50)
  })
})

describe('progressKd', () => {
  it('is total kills / total deaths', () => {
    expect(progressKd([row({ kills: 20, deaths: 10 }), row({ kills: 5, deaths: 1 })])).toBe((25 / 11).toFixed(2))
    expect(progressKd([row()])).toBe('-')
  })
})

describe('breakdownRows', () => {
  it('win rate is over matches with a known result, K/D and round win rate are pooled', () => {
    const rows = breakdownRows([
      row({ agent: 'Jett', won: true, kills: 20, deaths: 10, rounds_won: 13, rounds_lost: 5 }),
      row({ agent: 'Jett', won: null, kills: 5, deaths: 1, rounds_won: 8, rounds_lost: null }),
      row({ agent: 'Jett', won: false, rounds_won: 7, rounds_lost: 13 }),
      row({ agent: 'Sova' }),
    ], 'agent')
    expect(rows[0]).toEqual({ name: 'Jett', games: 3, wins: 1, wr: 50, kda: (25 / 11).toFixed(1), roundWr: `${Math.round(20 / 38 * 100)}%` })
    expect(rows[1]).toMatchObject({ name: 'Sova', wr: null, kda: '-', roundWr: '-' })
  })
})
