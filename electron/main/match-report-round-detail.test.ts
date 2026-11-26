import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => process.cwd(), getPath: () => process.cwd() } }))
import { RiotLocalApi } from './riot-local-api'
import { syncMatchReports, EMPTY_SYNC_STATE } from './match-report-sync'
import { ROUND_DETAIL_MAX_BYTES, roundDetailFields } from './match-report-round-detail'

const START = 1_700_000_000_000
const SELF = 'local-player'
const AGENT = '569fdd95-4d10-43ab-ca70-79becc718b46'
const BLUE = [SELF, 'b1', 'b2', 'b3', 'b4']
const RED = ['r0', 'r1', 'r2', 'r3', 'r4']
const ALL = [...BLUE, ...RED]

/** A full-length competitive match: 10 players, 24 rounds, 7 kills a round. */
function fullMatch(rounds = 24, version: string | null = 'release-11.10-shipping-12-3456789') {
  const kills: Array<Record<string, unknown>> = []
  const roundResults: Array<Record<string, unknown>> = []
  for (let r = 0; r < rounds; r++) {
    const roundStart = 30_000 + r * 110_000
    const roundKills = Array.from({ length: 7 }, (_, k) => {
      const blueKills = (r + k) % 2 === 0
      const killer = (blueKills ? BLUE : RED)[(r + k) % 5]
      const victim = (blueKills ? RED : BLUE)[(r * 3 + k) % 5]
      const roundTime = 15_000 + k * 6_000
      return {
        killer, victim, round: r, roundTime, gameTime: roundStart + roundTime,
        assistants: k % 3 === 0 ? [(blueKills ? BLUE : RED)[(r + k + 1) % 5]] : [],
        finishingDamage: { damageType: 'Weapon', damageItem: '9C82E19D-4575-0200-1A81-3EACF00CF872', isSecondaryFireMode: false },
        victimLocation: { x: 1000 + k * 100, y: -2000 + r * 50 },
        playerLocations: ALL.map((s, i) => ({ subject: s, viewRadians: 1.5, location: { x: i * 300, y: i * -200 } })),
      }
    })
    kills.push(...roundKills)
    roundResults.push({
      roundNum: r, winningTeam: r % 3 === 0 ? 'Red' : 'Blue', roundResult: 'Eliminated', roundResultCode: 'Elimination',
      playerStats: ALL.map((s, i) => ({
        subject: s, score: 200,
        kills: roundKills.filter(k => k.killer === s),
        economy: { loadoutValue: 3900, weapon: 'x', armor: 'y', remaining: 400 + i * 50, spent: 3500 },
        damage: [0, 1].map(j => ({ receiver: ALL[(i + 5 + j) % 10], damage: 140, legshots: 1, bodyshots: 2, headshots: 1 })),
        ability: {},
      })),
    })
  }
  const stat = (s: string) => ({
    kills: kills.filter(k => k.killer === s).length,
    deaths: kills.filter(k => k.victim === s).length,
    assists: kills.filter(k => (k.assistants as string[]).includes(s)).length,
    score: 5_000, roundsPlayed: rounds,
    abilityCasts: { grenadeCasts: 10, ability1Casts: 12, ability2Casts: 8, ultimateCasts: 2 },
  })
  return {
    matchInfo: {
      matchId: 'match-1', mapId: '/Game/Maps/Ascent/Ascent', queueID: 'competitive', gameMode: '/Game/GameModes/Bomb/BombGameMode.BombGameMode_C',
      gameStartMillis: START, gameLengthMillis: rounds * 110_000, isCompleted: true, ...(version ? { gameVersion: version } : {}),
    },
    players: ALL.map(s => ({
      subject: s, gameName: s === SELF ? 'Tester' : `Player ${s}`, tagLine: 'EUW', teamId: BLUE.includes(s) ? 'Blue' : 'Red',
      characterId: AGENT, competitiveTier: 18, accountLevel: 120, stats: stat(s),
      roundDamage: Array.from({ length: rounds }, (_, r) => ({ round: r, receiver: 'r0', damage: 140 })),
    })),
    kills,
    roundResults,
  }
}

function api(details: Record<string, unknown>) {
  const a = new RiotLocalApi()
  const internal = a as any
  Object.assign(internal, { ownPuuid: SELF, playerName: 'Tester', playerTag: 'EUW', region: 'eu', accessToken: 'test', entitlementsToken: 'test' })
  vi.spyOn(a, 'initAuth').mockResolvedValue(true)
  vi.spyOn(internal, '_fetchRecentMatchHistory').mockResolvedValue([{ matchId: 'match-1', gameStartTimeMs: START }])
  vi.spyOn(internal, '_fetchMatchDetails').mockResolvedValue(details)
  return a
}

async function postedBody(details: Record<string, unknown>) {
  const a = api(details)
  const posts: any[] = []
  const res = await syncMatchReports({
    fetchRecent: n => a.fetchRecentMatchTimelines(n),
    post: async body => { posts.push(body); return { status: 200, data: { success: true } } },
    loadState: async () => EMPTY_SYNC_STATE,
    saveState: async () => {},
  })
  expect(res.skipped).toBe(0)
  expect(posts).toHaveLength(1)
  return posts[0]
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('match report round detail', () => {
  it('sends match_details_lite (with rounds), kill_events and game_version for a Valorant match', async () => {
    const body = await postedBody(fullMatch())
    expect(body.match_details_lite.players).toHaveLength(10)
    expect(body.match_details_lite.rounds).toHaveLength(24)
    expect(body.match_details_lite.rounds[0].players[0].damage[0]).toEqual({ receiver: expect.any(String), damage: 140, headshots: 1, bodyshots: 2, legshots: 1 })
    expect(body.kill_events).toHaveLength(24 * 7)
    expect(body.kill_events).toEqual(body.match_data.killEvents)
    expect(body.game_version).toBe('release-11.10-shipping-12-3456789')
    // Same slim object already in match_data: older APIs keep reading that.
    expect(body.match_details_lite).toEqual(body.match_data.matchDetailsLite)
  })

  it('keeps a full-length match well under the 512 KB limit', async () => {
    const body = await postedBody(fullMatch())
    const { match_details_lite, kill_events, game_version } = body
    const bytes = Buffer.byteLength(JSON.stringify({ match_details_lite, kill_events, game_version }), 'utf8')
    console.info(`[round-detail] 24-round match: ${bytes} bytes (lite ${Buffer.byteLength(JSON.stringify(match_details_lite))}, kills ${Buffer.byteLength(JSON.stringify(kill_events))})`)
    expect(bytes).toBeLessThan(ROUND_DETAIL_MAX_BYTES)
    expect(bytes).toBeLessThan(512 * 1024 / 2)
  })

  it('omits game_version when Riot did not report it', async () => {
    const body = await postedBody(fullMatch(24, null))
    expect(body.match_details_lite).toBeDefined()
    expect('game_version' in body).toBe(false)
  })
})

describe('roundDetailFields', () => {
  const lite = { matchInfo: { gameVersion: ' v1 ' }, players: [{ subject: 'a' }], rounds: [{ round: 0, winningTeam: 'Blue', players: [] }] }

  it('adds nothing without match details, for other games, or for bad input', () => {
    expect(roundDetailFields({ game: 'valorant', matchDetailsLite: null, killEvents: [] })).toEqual({})
    expect(roundDetailFields({ game: 'valorant' })).toEqual({})
    expect(roundDetailFields({ game: 'cs2', matchDetailsLite: lite, killEvents: [{}] })).toEqual({})
    expect(roundDetailFields(null)).toEqual({})
    expect(roundDetailFields('x')).toEqual({})
  })

  it('falls back to the captured client version', () => {
    expect(roundDetailFields({ game: 'valorant', gameClientVersion: 'client-1' })).toEqual({ game_version: 'client-1' })
    expect(roundDetailFields({ game: 'valorant', matchDetailsLite: lite }).game_version).toBe('v1')
  })

  it('drops kill events, then match details, when over the size cap (report still sent)', () => {
    const big = { game: 'valorant', matchDetailsLite: lite, killEvents: [{ pad: 'x'.repeat(2_000) }] }
    const noKills = roundDetailFields(big, 1_000)
    expect(noKills).toEqual({ match_details_lite: lite, game_version: 'v1' })
    expect(roundDetailFields(big, 50)).toEqual({ game_version: 'v1' })
  })
})
