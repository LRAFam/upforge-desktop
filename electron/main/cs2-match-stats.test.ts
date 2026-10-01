import { describe, expect, it, vi } from 'vitest'
vi.mock('@laihoe/demoparser2', () => ({
  parseEvent: vi.fn(),
  parseTicks: vi.fn(),
}))
import { calculateCs2MatchStats, type Cs2StatsInput } from './cs2-match-stats'
const base = (): Cs2StatsInput => ({
  steamId: 'me',
  tickRate: 64,
  starts: [
    { tick: 100, is_warmup_period: false },
    { tick: 1000, is_warmup_period: false },
  ],
  ends: [
    { tick: 900, winner: 'CT', is_warmup_period: false },
    { tick: 1900, winner: 'T', is_warmup_period: false },
  ],
  snapshots: [100, 900, 1000, 1900].flatMap((tick) => [
    {
      tick,
      health: 100,
      steamid: 'me',
      team_num: tick < 1000 ? 3 : 2,
      is_alive: tick !== 1900,
      current_equip_value: tick < 1000 ? 4500 : 1000,
    },
    {
      tick,
      health: 100,
      steamid: 'mate',
      team_num: tick < 1000 ? 3 : 2,
      is_alive: true,
      current_equip_value: 4500,
    },
    {
      tick,
      health: 100,
      steamid: 'enemy',
      team_num: tick < 1000 ? 2 : 3,
      is_alive: tick !== 900,
      current_equip_value: 4500,
    },
  ]),
  deaths: [
    {
      tick: 200,
      is_warmup_period: false,
      attacker_steamid: 'me',
      user_steamid: 'enemy',
      attacker_team_num: 3,
      user_team_num: 2,
      headshot: true,
    },
    {
      tick: 1100,
      is_warmup_period: false,
      attacker_steamid: 'enemy',
      user_steamid: 'me',
      attacker_team_num: 3,
      user_team_num: 2,
      headshot: false,
    },
    {
      tick: 1200,
      is_warmup_period: false,
      attacker_steamid: 'mate',
      user_steamid: 'enemy',
      attacker_team_num: 2,
      user_team_num: 3,
      headshot: false,
    },
  ],
  hurts: [
    {
      tick: 200,
      is_warmup_period: false,
      attacker_steamid: 'me',
      user_steamid: 'enemy',
      attacker_team_num: 3,
      user_team_num: 2,
      dmg_health: 100,
      health: 0,
      weapon: 'ak47',
    },
  ],
  fires: [
    {
      tick: 150,
      is_warmup_period: false,
      user_steamid: 'me',
      weapon: 'weapon_flashbang',
    },
  ],
  blinds: [],
})
describe('CS2 measured statistics', () => {
  it('computes damage, headshots, sides, traded KAST and equipment with measured zeros', () => {
    const result = calculateCs2MatchStats(base())!
    expect(result.rounds).toBe(2)
    expect(result.score).toBe('2-0')
    expect(result.player_stats).toMatchObject({
      kills: 1,
      deaths: 1,
      adr: 50,
      headshot_pct: 100,
      kast_pct: 100,
      opening_kills: 1,
      opening_deaths: 1,
    })
    expect(result.round_stats).toMatchObject({
      ct_kd: 1,
      t_kd: 0,
      rounds_with_kills: 1,
      zero_impact_rounds: 1,
    })
    expect(result.utility_stats).toMatchObject({
      flashes_thrown: 1,
      smokes_thrown: 0,
      utility_damage: 0,
    })
    expect(result.economy_stats).toMatchObject({
      full_buys: 1,
      eco_rounds: 1,
      avg_eq_ct: 4500,
      avg_eq_t: 1000,
      avg_saved: 2250,
    })
  })
  it('excludes warmup, team damage and events after the round', () => {
    const data = base()
    data.hurts!.push(
      { ...data.hurts![0], is_warmup_period: true, dmg_health: 500 },
      { ...data.hurts![0], user_team_num: 3, dmg_health: 500 },
      { ...data.hurts![0], tick: 950, dmg_health: 500 },
    )
    expect(calculateCs2MatchStats(data)!.player_stats.adr).toBe(50)
  })
  it('caps lethal damage at remaining health rather than counting overkill', () => {
    const data = base()
    data.snapshots.find(
      (r) => r.tick === 100 && r.steamid === 'enemy',
    )!.health = 30
    data.hurts![0]!.dmg_health = 160
    expect(calculateCs2MatchStats(data)!.player_stats.adr).toBe(15)
  })
  it('leaves unavailable streams null instead of generating zero measurements', () => {
    const data = base()
    data.hurts = null
    data.fires = null
    data.blinds = null
    data.snapshots[0]!.current_equip_value = null
    const result = calculateCs2MatchStats(data)!
    expect(result.player_stats.adr).toBeNull()
    expect(result.utility_stats.flashes_thrown).toBeNull()
    expect(result.utility_stats.enemies_flashed).toBeNull()
    expect(result.economy_stats.full_buys).toBeNull()
  })
  it('does not count late revenge kills as trades', () => {
    const data = base()
    data.deaths[2]!.tick = 1800
    expect(calculateCs2MatchStats(data)!.player_stats.kast_pct).toBe(50)
  })
  it('does not invent participation from absent round snapshots', () => {
    const data = base()
    data.snapshots = []
    expect(calculateCs2MatchStats(data)).toBeNull()
  })
})

it('counts a won clutch only after the player becomes the last teammate alive', () => {
  const data = base()
  data.deaths.unshift({
    tick: 150,
    is_warmup_period: false,
    attacker_steamid: 'enemy',
    user_steamid: 'mate',
    attacker_team_num: 2,
    user_team_num: 3,
    headshot: false,
  })
  expect(calculateCs2MatchStats(data)!.player_stats).toMatchObject({
    clutches_attempted: 1,
    clutches_won: 1,
  })
})

it('does not label survival as measured when the end snapshot is absent', () => {
  const data = base()
  data.snapshots = data.snapshots.filter(
    (r) => !(r.tick === 1900 && r.steamid === 'me'),
  )
  const result = calculateCs2MatchStats(data)!
  expect(result.player_stats.kast_pct).toBeNull()
  expect(result.economy_stats.avg_saved).toBeNull()
})
