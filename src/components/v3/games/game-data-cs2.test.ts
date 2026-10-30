import { describe, expect, it } from 'vitest'
import { cs2MapRows, cs2MapsHaveWinRate, cs2Stats, type Cs2Profile } from './game-data'

const profile = (v: Partial<Cs2Profile['valve_stats']>, faceit?: Cs2Profile['faceit']): Cs2Profile => ({
  identity: { steam_display_name: 'Rook', steam_id: null, linked: true },
  valve_stats: { matches_tracked: 0, avg_kd: null, premier_rating: null, map_breakdown: [], ...v },
  faceit,
})

describe('CS2 Progress from measured match stats', () => {
  it('shows ADR, headshot kills, KAST and opening duels only when measured, with match counts', () => {
    const items = cs2Stats(profile({
      matches_tracked: 4, avg_kd: 1.1,
      averages: {
        kd: { value: 1.1, matches: 4 }, adr: { value: 82.4, matches: 3 },
        headshot_pct: { value: 47.6, matches: 4 }, kast_pct: { value: null, matches: 0 },
      },
      opening_duels: { won: 6, lost: 4, win_rate: 60, matches: 4 },
    }), null)
    expect(items.map(i => i.caption)).toEqual(['Matches tracked', 'Average K/D', 'ADR', 'Headshot kills', 'Opening duels won'])
    expect(items.find(i => i.caption === 'ADR')).toMatchObject({ value: '82', sub: 'Over 3 matches' })
    expect(items.find(i => i.caption === 'Opening duels won')).toMatchObject({ value: '60%', sub: '6 of 10', tone: 'win' })
  })

  it('keeps working against an older API that sends only K/D and map counts', () => {
    expect(cs2Stats(profile({ matches_tracked: 2, avg_kd: 0.9 }), null).map(i => i.caption)).toEqual(['Matches tracked', 'Average K/D'])
    expect(cs2MapsHaveWinRate([{ map: 'de_nuke', matches: 2 }])).toBe(false)
  })

  it('uses win rate and K/D per map when the API measured them', () => {
    const maps = [{ map: 'de_mirage', matches: 3, kd: 1.25, win_rate: 66.7 }, { map: 'de_nuke', matches: 1, kd: 0.5, win_rate: 0 }]
    expect(cs2MapsHaveWinRate(maps)).toBe(true)
    expect(cs2MapRows(maps)).toEqual([
      { name: 'Mirage', games: 3, pct: 67, tone: 'win', extra: 'K/D 1.25' },
      { name: 'Nuke', games: 1, pct: 0, tone: 'loss', extra: 'K/D 0.50' },
    ])
  })

  it('shows the FACEIT Elo change since the last sync', () => {
    const item = cs2Stats(profile({}, { connected: true, elo: 1720, elo_change: 35 }), { connected: true, elo: 1720, level: 8 })[0]
    expect(item).toMatchObject({ value: '1720', caption: 'FACEIT Elo', sub: 'Level 8 · +35 since last sync', tone: 'win' })
  })
})
