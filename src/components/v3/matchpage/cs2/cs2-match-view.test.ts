import { describe, expect, it } from 'vitest'
import { buildCs2MatchView, hasMeasured, weaponLabel } from './cs2-match-view'

const stats = {
  schema_version: 1, rounds: 22, score: '13-9',
  player_stats: { kills: 21, deaths: 15, assists: 4, adr: 84.27, headshot_pct: 47.6, kast_pct: 72.7, opening_kills: 4, opening_deaths: 3, clutches_won: 1, clutches_attempted: 3, multi_kills: { 2: 4, 3: 1 } },
  round_stats: { rounds_with_kills: 14, zero_impact_rounds: 5, ct_kd: 1.6, t_kd: 1.17 },
  utility_stats: { grenades_thrown: 31, smokes_thrown: 9, flashes_thrown: 12, molotovs_thrown: 6, he_thrown: 4, enemies_flashed: 7, teammates_flashed: 2, utility_damage: 96 },
  economy_stats: { full_buys: 14, force_buys: 4, eco_rounds: 4, avg_eq_ct: 4310.4, avg_eq_t: 3890, avg_saved: 410 },
}

describe('buildCs2MatchView', () => {
  it('shapes measured stats into rows with whole numbers for counts', () => {
    const v = buildCs2MatchView(stats)!
    expect(v.score).toBe('13-9')
    expect(v.headline.find(r => r.label === 'ADR')!.value).toBe('84.3')
    expect(v.duels.find(r => r.label === 'Opening duels won')!.value).toBe('4 of 7')
    expect(v.duels.find(r => r.label === 'Clutches won')!.value).toBe('1 of 3')
    expect(v.duels.find(r => r.label === 'Rounds with 2+ kills')!.value).toBe('5')
    expect(v.economy.find(r => r.label === 'Average equipment, CT')!.value).toBe('$4,310')
  })

  it('never turns a missing measurement into zero', () => {
    const v = buildCs2MatchView({ ...stats, utility_stats: { grenades_thrown: null }, player_stats: { kills: null, deaths: 15, assists: null } })!
    expect(v.headline[0].value).toBe('Not measured')
    expect(hasMeasured(v.utility)).toBe(false)
  })

  it('builds round rows and weapon counts from the recording when present', () => {
    const v = buildCs2MatchView(stats, {
      roundSummaries: [
        { roundNumber: 0, winningTeam: 'ALLY', ceremony: 'elimination' },
        { roundNumber: 1, winningTeam: 'ENEMY', ceremony: 'detonation', spikePlanted: true, spikeSite: 'B' },
      ],
      kills: [{ round: 0, weapon: 'weapon_ak47' }, { round: 0, weapon: 'ak47' }, { round: 1, weapon: 'awp' }],
      deaths: [{ round: 1 }],
    })!
    expect(v.roundRows).toEqual([
      { round: 1, result: 'won', ended: 'Elimination', kills: 2, deaths: 0, plant: null },
      { round: 2, result: 'lost', ended: 'Bomb exploded', kills: 1, deaths: 1, plant: 'Planted B' },
    ])
    expect(v.weapons[0]).toEqual({ label: 'AK-47', value: '2 kills' })
    expect(v.weapons[1]).toEqual({ label: 'AWP', value: '1 kill' })
  })

  it('returns null with nothing to show', () => {
    expect(buildCs2MatchView(null)).toBeNull()
  })

  it('labels weapons', () => {
    expect(weaponLabel('weapon_m4a1_silencer')).toBe('M4A1-S')
    expect(weaponLabel('sg556')).toBe('Sg556')
  })
})
