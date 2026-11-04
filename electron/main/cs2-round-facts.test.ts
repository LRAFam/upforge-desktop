import { describe, expect, it } from 'vitest'
import { blindAt, buildCs2RoundFacts, flashHitsFromSamples, humanizeCs2Place, markPistolRounds, type Cs2RoundFactsInput } from './cs2-round-facts'

const ME = 'me', T1 = 'ally1', T2 = 'ally2', E1 = 'enemy1', E2 = 'enemy2'
const RATE = 64

function player(steamid: string, team: number, tick: number, equip: number, balance: number | null = 800) {
  return { tick, steamid, team_num: team, is_alive: true, current_equip_value: equip, balance }
}

function base(): Cs2RoundFactsInput {
  const start = 1000
  return {
    steamId: ME,
    tickRate: RATE,
    starts: [{ tick: start, is_warmup_period: false }, { tick: 20000, is_warmup_period: false }],
    ends: [{ tick: 10000, winner: 'CT', is_warmup_period: false }, { tick: 30000, winner: 'T', is_warmup_period: false }],
    snapshots: [
      player(ME, 3, start, 900, 100), player(T1, 3, start, 800), player(T2, 3, start, 700),
      player(E1, 2, start, 1000), player(E2, 2, start, 950),
      player(ME, 2, 20000, 850), player(T1, 2, 20000, 800), player(T2, 2, 20000, 800),
      player(E1, 3, 20000, 1000), player(E2, 3, 20000, 1000),
    ],
    deaths: [],
    plants: [],
    grenades: [],
    flashHits: [],
    deathPositions: [],
  }
}

const death = (tick: number, attacker: string, attackerTeam: number, victim: string, victimTeam: number, extra: Record<string, unknown> = {}) => ({
  tick, attacker_steamid: attacker, attacker_team_num: attackerTeam, user_steamid: victim, user_team_num: victimTeam,
  is_warmup_period: false, ...extra,
})

describe('buildCs2RoundFacts', () => {
  it('adds side, equipment, money and pistol rounds per live round', () => {
    const { rounds } = buildCs2RoundFacts(base())
    expect(rounds[0]).toMatchObject({
      side: 'CT', pistolRound: true,
      equipment: { you: 900, team: 2400, enemy: 1950 },
      money: { you: 100, team: 1700, enemy: 1600 },
    })
    // First round after the side switch with ≤ $1,000 equipment is the second pistol round.
    expect(rounds[1]).toMatchObject({ side: 'T', pistolRound: true })
  })

  it('leaves money out when any player balance is missing (never 0 for unknown)', () => {
    const input = base()
    input.snapshots[3] = player(E1, 2, 1000, 1000, null)
    expect(buildCs2RoundFacts(input).rounds[0]!.money).toBeUndefined()
  })

  it('measures alive counts, round time, distance, flags, blind and the 5 s trade', () => {
    const input = base()
    const kill = death(1640, ME, 3, E1, 2, { distance: 12.345, thrusmoke: true, assistedflash: true })
    const myDeath = death(3000, E2, 2, ME, 3, { attackerblind: true, user_X: 0, user_Y: 0 })
    const trade = death(3000 + 4.9 * RATE, T1, 3, E2, 2)
    input.deaths = [trade, myDeath, kill]
    input.plants = [{ tick: 2000 }]
    input.flashHits = [{ tick: 2950, thrower_steamid: E1, steamid: ME, duration: 3 }]
    input.deathPositions = [
      { tick: 3000, steamid: T1, team_num: 3, is_alive: true, X: 300, Y: 400 },
      { tick: 3000, steamid: T2, team_num: 3, is_alive: true, X: 3000, Y: 0 },
    ]
    const { events, rounds } = buildCs2RoundFacts(input)
    expect(events.get(kill)).toEqual({ alive: '3v2', roundTime: 10, distance: 12.3, thruSmoke: true, assistedFlash: true })
    expect(events.get(myDeath)).toEqual({
      alive: '3v1', afterPlant: true, roundTime: 31.3, attackerBlind: true,
      blind: { seconds: 2.2, by: 'enemy' }, traded: true, alliesAlive: 2, alliesNearby: 1,
    })
    expect(rounds[0]!.openingUtility).toEqual({})
  })

  it('does not call a kill 5.5 s later a trade', () => {
    const input = base()
    const myDeath = death(3000, E2, 2, ME, 3)
    input.deaths = [myDeath, death(3000 + 5.5 * RATE, T1, 3, E2, 2)]
    expect(buildCs2RoundFacts(input).events.get(myDeath)!.traded).toBe(false)
  })

  it('leaves blind and nearby allies unmeasured when the demo gave no data', () => {
    const input = base()
    input.flashHits = null
    input.deathPositions = null
    const myDeath = death(3000, E2, 2, ME, 3, { user_X: 0, user_Y: 0 })
    input.deaths = [myDeath]
    const fact = buildCs2RoundFacts(input).events.get(myDeath)!
    expect(fact.blind).toBeUndefined()
    expect(fact.alliesNearby).toBeUndefined()
    expect(fact.blind).not.toEqual({ seconds: 0 })
  })

  it('marks last alive vs N, after the plant, and team utility before the opening duel', () => {
    const input = base()
    input.plants = [{ tick: 1500 }]
    input.grenades = [
      { tick: 1400, user_steamid: T1, weapon: 'flashbang' },
      { tick: 1450, user_steamid: T2, weapon: 'weapon_incgrenade' },
      { tick: 1460, user_steamid: E1, weapon: 'smokegrenade' },
      { tick: 900, user_steamid: T1, weapon: 'smokegrenade' },
    ]
    input.deaths = [death(1600, E1, 2, T1, 3), death(1700, E1, 2, T2, 3)]
    // Opening duel must involve the player for openingUtility.
    expect(buildCs2RoundFacts(input).rounds[0]!.openingUtility).toBeUndefined()
    expect(buildCs2RoundFacts(input).rounds[0]).toMatchObject({ lastAliveVs: 2, lastAliveAfterPlant: true })
    input.deaths = [death(1600, E1, 2, ME, 3)]
    expect(buildCs2RoundFacts(input).rounds[0]!.openingUtility).toEqual({ flashbang: 1, molotov: 1 })
  })

  it('counts the player flashes (≥ 1 s) from flash hits and grenade_thrown', () => {
    const input = base()
    input.grenades = [{ tick: 1500, user_steamid: ME, weapon: 'flashbang', is_warmup_period: false }]
    input.flashHits = [
      { tick: 1560, thrower_steamid: ME, steamid: E1, duration: 2.5 },
      { tick: 1560, thrower_steamid: ME, steamid: E2, duration: 0.6 },
      { tick: 1560, thrower_steamid: ME, steamid: T1, duration: 1.5 },
      { tick: 1560, thrower_steamid: ME, steamid: ME, duration: 3 },
    ]
    const res = buildCs2RoundFacts(input)
    expect(res.flashCounts).toEqual({ enemies: 1, teammates: 1 })
    expect(res.playerFlashes).toEqual({ thrown: 1, enemies: 1, teammates: 1, min_seconds: 1, enemy_seconds_avg: 2.5 })
    expect(buildCs2RoundFacts({ ...input, flashHits: null }).flashCounts).toBeNull()
  })
})

describe('flash helpers', () => {
  it('rebuilds who a flash blinded from flash_duration either side of the detonation', () => {
    const hits = flashHitsFromSamples(
      [{ tick: 100, user_steamid: E1 }],
      [
        { tick: 99, steamid: ME, flash_duration: 0 }, { tick: 101, steamid: ME, flash_duration: 2.456 },
        { tick: 99, steamid: T1, flash_duration: 1 }, { tick: 101, steamid: T1, flash_duration: 1 },
      ],
    )
    expect(hits).toEqual([{ tick: 100, thrower_steamid: E1, steamid: ME, duration: 2.46 }])
  })

  it('reports flash left at death, below 0.5 s is not blind', () => {
    const teams = new Map<unknown, unknown>([[ME, 3], [T1, 3]])
    const hits = [{ tick: 0, thrower_steamid: T1, steamid: ME, duration: 2 }]
    expect(blindAt(hits, ME, 64, 64, teams)).toEqual({ seconds: 1, by: 'teammate' })
    expect(blindAt(hits, ME, 100, 64, teams)).toBeNull()
  })

  it('only marks pistol rounds with pistol money', () => {
    const rounds = [{ side: 'CT' as const, equipment: { you: 4000, team: 0, enemy: 0 } }]
    markPistolRounds(rounds)
    expect(rounds[0]).not.toHaveProperty('pistolRound')
  })
})

describe('humanizeCs2Place', () => {
  it('turns Valve place names into callouts like the AI service', () => {
    expect(humanizeCs2Place('BombsiteA')).toBe('A site')
    expect(humanizeCs2Place('CTSpawn')).toBe('CT spawn')
    expect(humanizeCs2Place('LongA')).toBe('Long A')
    expect(humanizeCs2Place('LowerTunnel')).toBe('Lower Tunnel')
    expect(humanizeCs2Place('Pit')).toBe('Pit')
    expect(humanizeCs2Place('')).toBeNull()
    expect(humanizeCs2Place(null)).toBeNull()
  })
})
