import { beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'

vi.mock('@laihoe/demoparser2', () => ({
  parseHeader: vi.fn(), parseEvent: vi.fn(), parsePlayerInfo: vi.fn(), parseTicks: vi.fn(),
}))
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), debug: vi.fn() } }))

import { parseEvent, parseHeader, parsePlayerInfo, parseTicks } from '@laihoe/demoparser2'
import { buildCs2TimelineFromDemo } from './cs2-demo-parser'
import { resetCs2IdentityState, setKnownCs2Identity } from './cs2-identity-state'
import {
  cachedCs2DemoSource,
  collectCs2DemoBundle,
  eventKey,
  nativeCs2DemoSource,
  ticksKey,
  type Cs2DemoSource,
} from './cs2-demo-source'

const ME = '76561198000000001'
const ENEMY = '76561198000000002'

function mockDemo() {
  vi.mocked(parseHeader).mockReturnValue({ map_name: 'de_mirage', playback_ticks: 128000, playback_time: 2000 })
  vi.mocked(parsePlayerInfo).mockReturnValue([
    { name: 'Me', steamid: ME, team_number: 3 },
    { name: 'Enemy', steamid: ENEMY, team_number: 2 },
  ])
  vi.mocked(parseEvent).mockImplementation((_p, name) => {
    if (name === 'round_start') return [{ tick: 100, total_rounds_played: 0 }]
    if (name === 'round_freeze_end') return [{ tick: 200, total_rounds_played: 0, is_warmup_period: false }]
    if (name === 'player_death') {
      return [{
        tick: 6400, total_rounds_played: 0, attacker_name: 'Me', attacker_steamid: ME,
        user_name: 'Enemy', user_steamid: ENEMY, weapon: 'ak47', attacker_team_num: 3, user_team_num: 2,
      }]
    }
    if (name === 'round_end') return [{ winner: 'CT', tick: 12800, total_rounds_played: 1, is_warmup_period: false }]
    if (name === 'player_hurt') throw new Error('no hurt events')
    return []
  })
  vi.mocked(parseTicks).mockReturnValue([
    { tick: 200, steamid: ME, team_num: 3, is_alive: true, health: 100, current_equip_value: 4700 },
    { tick: 12800, steamid: ME, team_num: 3, is_alive: true, health: 80, current_equip_value: 4700 },
  ])
}

/** Wraps a source and records every key the builders ask for. */
function recording(inner: Cs2DemoSource, keys: Set<string>): Cs2DemoSource {
  return {
    header: () => { keys.add('header'); return inner.header() },
    playerInfo: () => { keys.add('playerInfo'); return inner.playerInfo() },
    event: (n, a, b) => { keys.add(eventKey(n, a, b)); return inner.event(n, a, b) },
    ticks: (p, t) => { keys.add(ticksKey(p, t)); return inner.ticks(p, t) },
  }
}

const opts = {
  game: 'cs2' as const, demoPath: '/tmp/m.dem', map: null, matchStartTime: 1_700_000_000_000,
  recordingStartTime: 1_700_000_000_000, localPlayerName: 'Me', skipSpatial: true,
}

beforeEach(() => {
  vi.clearAllMocks()
  resetCs2IdentityState()
  setKnownCs2Identity(ME, 'api')
  vi.spyOn(fs, 'existsSync').mockReturnValue(true)
  mockDemo()
})

describe('CS2 demo worker plan', () => {
  it('covers every demoparser2 call the timeline + stats builders make', () => {
    const asked = new Set<string>()
    const direct = buildCs2TimelineFromDemo(opts, recording(nativeCs2DemoSource(opts.demoPath), asked))
    expect(direct?.match_stats).toBeTruthy()
    expect([...asked].some(k => k.startsWith('ticks:'))).toBe(true)

    const bundle = collectCs2DemoBundle(nativeCs2DemoSource(opts.demoPath))
    for (const key of asked) expect(bundle, key).toHaveProperty([key])
  })

  it('builds the same timeline from the cached worker bundle as from native calls', () => {
    const direct = buildCs2TimelineFromDemo(opts)
    const bundle = structuredClone(collectCs2DemoBundle(nativeCs2DemoSource(opts.demoPath)))
    vi.mocked(parseEvent).mockImplementation(() => { throw new Error('main thread must not parse') })
    vi.mocked(parseHeader).mockImplementation(() => { throw new Error('main thread must not parse') })
    vi.mocked(parsePlayerInfo).mockImplementation(() => { throw new Error('main thread must not parse') })
    vi.mocked(parseTicks).mockImplementation(() => { throw new Error('main thread must not parse') })
    const cached = buildCs2TimelineFromDemo(opts, cachedCs2DemoSource(bundle))
    const strip = (t: typeof direct) => ({ ...t, endTime: 0 })
    expect(strip(cached)).toEqual(strip(direct))
  })

  it('keeps a failed native call as a failure in the bundle', () => {
    const bundle = collectCs2DemoBundle(nativeCs2DemoSource(opts.demoPath))
    const source = cachedCs2DemoSource(bundle)
    expect(() => source.event('player_hurt', ['team_num'], ['total_rounds_played', 'is_warmup_period'])).toThrow('no hurt events')
    expect(() => source.event('not_planned', [], [])).toThrow('not in worker plan')
  })
})
