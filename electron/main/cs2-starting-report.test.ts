import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => process.cwd(), getPath: () => '/tmp' } }))
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), debug: vi.fn() } }))

import { cs2StartingReportMatches } from './cs2-starting-report'

const stats = {
  schema_version: 1, rounds: 20, score: '13-7',
  player_stats: { kills: 20, adr: 85 }, round_stats: { ct_kd: 1.2 }, utility_stats: { utility_damage: 40 }, economy_stats: { avg_eq_ct: 4000 },
}

describe('cs2StartingReportMatches', () => {
  it('sends full match_stats and game_mode, newest first, ranked or unknown modes only', () => {
    const recs = [
      { id: 'a', game: 'cs2', matchId: 'm1', map: 'de_dust2', gameMode: 'PREMIER', timeline: { match_stats: stats, finalStats: { won: true } } },
      { id: 'b', game: 'cs2', map: 'de_vertigo', gameMode: 'WINGMAN', timeline: { match_stats: stats } },
      { id: 'c', game: 'valorant', gameMode: 'COMPETITIVE', timeline: { match_stats: stats } },
      { id: 'd', game: 'cs2', map: 'de_inferno', gameMode: '', timeline: { gameMode: 'COMPETITIVE', match_stats: stats } },
      { id: 'e', game: 'cs2', map: 'de_nuke', gameMode: '', timeline: { match_stats: stats } },
      { id: 'f', game: 'cs2', map: 'de_anubis', gameMode: 'COMPETITIVE', timeline: { match_stats: null } },
    ]
    expect(cs2StartingReportMatches(recs)).toEqual([
      {
        match_key: 'm1', map: 'de_dust2', won: true, game_mode: 'premier',
        match_stats: { player_stats: stats.player_stats, round_stats: stats.round_stats, utility_stats: stats.utility_stats, economy_stats: stats.economy_stats },
      },
      expect.objectContaining({ match_key: 'd', game_mode: 'competitive', won: null }),
      expect.objectContaining({ match_key: 'e', game_mode: null }),
    ])
  })

  it('caps the list at 10 matches', () => {
    const recs = Array.from({ length: 15 }, (_, i) => ({ id: `r${i}`, game: 'cs2', gameMode: 'COMPETITIVE', timeline: { match_stats: stats } }))
    expect(cs2StartingReportMatches(recs)).toHaveLength(10)
  })
})
