import { beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'

vi.mock('@laihoe/demoparser2', () => ({
  parseHeader: vi.fn(), parseEvent: vi.fn(), parsePlayerInfo: vi.fn(), parseTicks: vi.fn(),
}))
vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => process.cwd(), getPath: () => '/tmp' } }))
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), debug: vi.fn() } }))

import { parseEvent, parseHeader, parsePlayerInfo, parseTicks } from '@laihoe/demoparser2'
import { buildCs2TimelineFromDemo } from './cs2-demo-parser'
import { resetCs2IdentityState, setKnownCs2Identity } from './cs2-identity-state'
import { prepareMatchDataForUpload } from './match-data-payload'

const ME = '76561198000000001'
const ALLY = '76561198000000003'
const ENEMY = '76561198000000002'
const RATE = 64
const FREEZE = 1000

const deathRow = (tick: number, attacker: string, aTeam: number, victim: string, vTeam: number, extra: Record<string, unknown> = {}) => ({
  tick, total_rounds_played: 0, is_warmup_period: false,
  attacker_steamid: attacker, attacker_name: attacker === ME ? 'Me' : attacker === ALLY ? 'Ally' : 'Enemy', attacker_team_num: aTeam,
  user_steamid: victim, user_name: victim === ME ? 'Me' : victim === ALLY ? 'Ally' : 'Enemy', user_team_num: vTeam,
  weapon: 'ak47', distance: 9.87, thrusmoke: false, attackerblind: false, assistedflash: false, ...extra,
})

function mockDemo() {
  vi.mocked(parseHeader).mockReturnValue({ map_name: 'de_mirage', playback_ticks: 128000, playback_time: 2000 })
  vi.mocked(parsePlayerInfo).mockReturnValue([
    // End-of-match teams: the player finished on T, but this round was played on CT.
    { name: 'Me', steamid: ME, team_number: 2 },
    { name: 'Ally', steamid: ALLY, team_number: 2 },
    { name: 'Enemy', steamid: ENEMY, team_number: 3 },
  ])
  vi.mocked(parseEvent).mockImplementation((_p, name) => {
    if (name === 'round_start') return [{ tick: 900, total_rounds_played: 0, is_warmup_period: false }]
    if (name === 'round_freeze_end') return [{ tick: FREEZE, total_rounds_played: 0, is_warmup_period: false }]
    if (name === 'round_end') return [{ winner: 'CT', tick: 9000, total_rounds_played: 1, is_warmup_period: false }]
    if (name === 'player_death') {
      return [
        // Warmup kill: not a match kill.
        deathRow(10, ME, 3, ENEMY, 2, { is_warmup_period: true }),
        deathRow(FREEZE + 20 * RATE, ENEMY, 2, ME, 3, { thrusmoke: true, user_X: 0, user_Y: 0, user_last_place_name: 'Underpass', attacker_last_place_name: 'TopofMid' }),
        deathRow(FREEZE + 24 * RATE, ALLY, 3, ENEMY, 2),
      ]
    }
    if (name === 'bomb_planted') return [{ tick: FREEZE + 10 * RATE, total_rounds_played: 0, site: 436, user_last_place_name: 'BombsiteB', user_name: 'Enemy' }]
    if (name === 'flashbang_detonate') return [{ tick: FREEZE + 19 * RATE, user_steamid: ENEMY, is_warmup_period: false }]
    if (name === 'grenade_thrown') return []
    return []
  })
  vi.mocked(parseTicks).mockImplementation((_p, props) => {
    if (props.includes('flash_duration')) {
      return [
        { tick: FREEZE + 19 * RATE - 1, steamid: ME, flash_duration: 0 },
        { tick: FREEZE + 19 * RATE + 1, steamid: ME, flash_duration: 2 },
      ]
    }
    if (props.includes('X')) {
      return [{ tick: FREEZE + 20 * RATE, steamid: ALLY, team_num: 3, is_alive: true, X: 200, Y: 0 }]
    }
    return [FREEZE, 9000].flatMap(tick => [
      { tick, steamid: ME, team_num: 3, is_alive: tick === FREEZE, health: 100, current_equip_value: 800, balance: 0 },
      { tick, steamid: ALLY, team_num: 3, is_alive: true, health: 100, current_equip_value: 800, balance: 50 },
      { tick, steamid: ENEMY, team_num: 2, is_alive: tick === FREEZE, health: 100, current_equip_value: 900, balance: 100 },
    ])
  })
}

const opts = {
  game: 'cs2' as const, demoPath: '/tmp/m.dem', map: null, matchStartTime: 1_700_000_000_000,
  recordingStartTime: 1_700_000_000_000, localPlayerName: 'Me',
}

beforeEach(() => {
  vi.clearAllMocks()
  resetCs2IdentityState()
  setKnownCs2Identity(ME, 'api')
  vi.spyOn(fs, 'existsSync').mockReturnValue(true)
  mockDemo()
})

describe('CS2 demo round facts on the timeline', () => {
  it('adds measured facts to the player death and the round summary', () => {
    const t = buildCs2TimelineFromDemo(opts)!
    expect(t.killEvents).toHaveLength(2)
    expect(t.playerKills).toHaveLength(0)
    const d = t.playerDeaths[0]!
    expect(d).toMatchObject({
      alive: '2v1', afterPlant: true, roundTime: 20, distance: 9.9, thruSmoke: true,
      blind: { seconds: 1, by: 'enemy' }, traded: true,
    })
    expect(d).not.toHaveProperty('attackerBlind')
    expect(d.spatial).toMatchObject({ callout: 'Underpass', killerCallout: 'Topof Mid', killerDistance: 9.9, traded: true, alliesAlive: 1, alliesNearby: 1, isolated: false })
    expect(t.roundSummaries[0]).toMatchObject({
      side: 'CT', winningTeam: 'ALLY', pistolRound: true, spikeSite: 'B',
      equipment: { you: 800, team: 1600, enemy: 900 }, money: { you: 0, team: 50, enemy: 100 },
    })
    expect(t.spatialSummary?.events.find(e => e.type === 'death')).toMatchObject({ traded: true, alliesNearby: 1 })
    // No player_blind rows: enemies flashed comes from flash hits, not a false 0 (none by the player here).
    expect(t.match_stats?.utility_stats.enemies_flashed).toBe(0)
    expect(t.playerFlashes).toEqual({ thrown: 0, enemies: 0, teammates: 0, min_seconds: 1 })
  })

  it('keeps the facts in the uploaded match_data', () => {
    const upload = prepareMatchDataForUpload(buildCs2TimelineFromDemo(opts))!
    expect(upload.playerDeaths[0]).toMatchObject({ traded: true, roundTime: 20, alive: '2v1' })
    expect(upload.roundSummaries[0]).toMatchObject({ side: 'CT', money: { you: 0, team: 50, enemy: 100 } })
    expect(upload.playerFlashes).toBeTruthy()
  })

  it('leaves flash counts unmeasured when neither player_blind nor flash samples can be read', () => {
    vi.mocked(parseTicks).mockImplementation((_p, props) => {
      if (props.includes('flash_duration')) throw new Error('no flash samples')
      if (props.includes('X')) return []
      return [FREEZE, 9000].flatMap(tick => [
        { tick, steamid: ME, team_num: 3, is_alive: true, health: 100, current_equip_value: 800, balance: 0 },
        { tick, steamid: ENEMY, team_num: 2, is_alive: true, health: 100, current_equip_value: 900, balance: 100 },
      ])
    })
    const t = buildCs2TimelineFromDemo(opts)!
    expect(t.match_stats?.utility_stats.enemies_flashed).toBeNull()
    expect(t.playerDeaths[0]).not.toHaveProperty('blind')
    expect(t.playerDeaths[0]!.spatial?.alliesNearby).toBeUndefined()
  })
})
