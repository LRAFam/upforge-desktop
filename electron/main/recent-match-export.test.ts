import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RiotLocalApi } from './riot-local-api'
import { emptyMatchData } from './recording-sync'
import { readRecentMatchReport, saveRecentMatchExports, serializeRecentMatch } from './recent-match-export'
import type { MatchData } from './riot-types'
import { prepareMatchDataForUpload } from './match-data-payload'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => process.cwd() } }))

const START = 1_700_000_000_000
const SELF = 'local-player'
const tempDirs: string[] = []

type ApiInternals = {
  ownPuuid: string | null
  playerName: string | null
  playerTag: string | null
  region: string | null
  accessToken: string | null
  entitlementsToken: string | null
  matchData: MatchData | null
  lastGameMode: string | null
  _fetchRecentMatchHistory(limit: number): Promise<Array<{ matchId: string; gameStartTimeMs: number | null }> | null>
  _fetchMatchDetails(matchId: string): Promise<Record<string, unknown> | null>
  _fetchLocal(path: string): Promise<unknown>
  _fetchClientVersion(): Promise<void>
}

function details() {
  const kill = (killer: string, victim: string, gameTime: number, round: number, assistants: string[] = [], damageType = 'Weapon') => ({
    killer, victim, gameTime, round, roundTime: gameTime - (round === 0 ? 5_000 : 15_000), assistants,
    finishingDamage: { damageType, damageItem: 'Vandal' },
    victimLocation: { x: 100, y: 200 },
    playerLocations: [{ subject: killer, location: { x: 90, y: 190 } }],
  })
  const kills = [
    kill(SELF.toUpperCase(), 'enemy', 10_000, 0),
    kill('ally', 'enemy-2', 12_000, 0, [SELF.toUpperCase()]),
    kill(SELF, SELF, 15_000, 0, [], 'Bomb'),
    kill('enemy', 'ally', 20_000, 1),
  ]
  return {
    matchInfo: { matchId: 'match-1', mapId: '/Game/Maps/Ascent/Ascent', queueID: 'competitive', gameStartMillis: START, gameLengthMillis: 120_000, isCompleted: true },
    players: [
      { subject: SELF, gameName: '', tagLine: '', teamId: 'Blue', characterId: 'add6443a-41bd-e414-f6ad-e58d267f4e95',
        stats: { kills: 1, deaths: 1, assists: 1, score: 500, roundsPlayed: 2, abilityCasts: { grenadeCasts: 0, ability1Casts: 1, ability2Casts: 0, ultimateCasts: 0 } } },
      { subject: 'enemy', gameName: 'Opponent', teamId: 'Red', characterId: '569fdd95-4d10-43ab-ca70-79becc718b46', stats: { kills: 1, deaths: 1, assists: 0 } },
      { subject: 'ally', gameName: 'Teammate', teamId: 'Blue', characterId: '569fdd95-4d10-43ab-ca70-79becc718b46', stats: { kills: 1, deaths: 1, assists: 0 } },
    ],
    kills,
    roundResults: [
      { roundNum: 0, winningTeam: 'Red', roundResultCode: 'Detonate', bombPlanter: 'enemy', plantRoundTime: 8_000, plantSite: 'A', plantLocation: { x: 100, y: 200 },
        playerStats: [{ subject: SELF, kills: [kills[0], kills[2]], score: 300, damage: [{ damage: 150, headshots: 1, bodyshots: 0, legshots: 0 }], economy: { spent: 800, remaining: 0 } }] },
      { roundNum: 1, winningTeam: 'Blue', roundResultCode: 'Defuse', bombPlanter: 'enemy', bombDefuser: SELF, plantRoundTime: 2_000, defuseRoundTime: 9_000, plantSite: 'B',
        playerStats: [{ subject: SELF, kills: [], score: 200, damage: [], economy: { spent: 0, remaining: 1000 } }] },
    ],
  }
}

function setup() {
  const api = new RiotLocalApi()
  const internal = api as unknown as ApiInternals
  Object.assign(internal, { ownPuuid: SELF, playerName: 'Tester', playerTag: 'EUW', region: 'eu', accessToken: 'test', entitlementsToken: 'test' })
  vi.spyOn(api, 'initAuth').mockResolvedValue(true)
  const history = vi.spyOn(internal, '_fetchRecentMatchHistory').mockResolvedValue([{ matchId: 'match-1', gameStartTimeMs: null }])
  const fetch = vi.spyOn(internal, '_fetchMatchDetails').mockResolvedValue(details())
  return { api, internal, history, fetch }
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(async () => {
  vi.restoreAllMocks()
  // Only directories created by this test through mkdtemp are removed.
  for (const dir of tempDirs.splice(0)) await rm(dir, { recursive: true, force: true })
})

describe('recent match timelines', () => {
  it('recovers Riot identity and the historical start/end, with spatial data available', async () => {
    const { api, history } = setup()
    history.mockResolvedValue([{ matchId: 'match-1', gameStartTimeMs: START - 86_400_000 }])
    const result = await api.fetchRecentMatchTimelines(10)
    expect(result.ok).toBe(true)
    const t = result.matches[0].timeline!
    expect(t).toMatchObject({ playerName: 'Tester', playerTag: 'EUW', matchStartTime: START, startTime: START, endTime: START + 120_000 })
    expect(result.matches[0].gameStartTimeMs).toBe(START)
    expect(t.finalStats?.summonerName).toBe('Tester#EUW')
    expect(t.teamSnapshot.find(p => p.puuid === SELF)?.summonerName).toBe('Tester')
    expect(t.matchDetails?.matchInfo).toMatchObject({ gameStartMillis: START })
    expect(t.spatialSummary?.events.length).toBeGreaterThan(0)
  })

  it('keeps local combat kills, deaths and assists separate from lobby events', async () => {
    const { api } = setup()
    const t = (await api.fetchRecentMatchTimelines(10)).matches[0].timeline!
    expect(t.killEvents).toHaveLength(4)
    expect(t.playerKills).toHaveLength(1)
    expect(t.playerDeaths).toHaveLength(1)
    expect(t.roundSummaries[0].playerStats).toMatchObject({ kills: 1, deaths: 1, assists: 1 })
    expect(t.roundSummaries[1].playerDamageDealt).toBe(0)
  })

  it('recognises Detonate, preserves unknown end times, and uses seconds for event times', async () => {
    const { api } = setup()
    const t = (await api.fetchRecentMatchTimelines(10)).matches[0].timeline!
    expect(t.roundSummaries[0]).toMatchObject({ spikeDetonated: true, endTime: null })
    expect(t.spikeDetonations).toHaveLength(0) // Riot did not report a detonation timestamp.
    expect(t.spikePlants[0]).toMatchObject({ EventTime: 13, gameTimeMs: 13_000 })
    expect(t.spikeDefuses[0]).toMatchObject({ EventTime: 24, gameTimeMs: 24_000 })
  })

  it('does not report a spike self-kill as first blood', async () => {
    const { api, fetch } = setup()
    const raw = details()
    raw.kills = [raw.kills[2]]
    fetch.mockResolvedValue(raw)
    const t = (await api.fetchRecentMatchTimelines(10)).matches[0].timeline!
    expect(t.firstBloods).toEqual([])
    expect(t.roundSummaries[0].playerGotFirstBlood).toBe(false)
  })

  it('matches repeated Deathmatch encounters by timestamp, not just killer and victim', async () => {
    const { api, fetch } = setup()
    const raw = details()
    raw.matchInfo.queueID = 'deathmatch'
    raw.kills = [raw.kills[0], { ...raw.kills[0], gameTime: 30_000, victimLocation: { x: 900, y: 950 } }]
    Object.assign(raw.players[0].stats, { kills: 2, deaths: 0, assists: 0 })
    fetch.mockResolvedValue(raw)
    const t = (await api.fetchRecentMatchTimelines(1)).matches[0].timeline!
    expect(t.playerKills.map(kill => kill.spatial?.victimWorld)).toEqual([{ x: 100, y: 200 }, { x: 900, y: 950 }])
    const payload = JSON.parse(serializeRecentMatch(t))
    expect(payload.respawnMode).toBe(true)
    expect(payload.match_data.playerKills.map((kill: { spatial?: { victimWorld?: unknown } }) => kill.spatial?.victimWorld))
      .toEqual([{ x: 100, y: 200 }, { x: 900, y: 950 }])
  })

  it('falls back to history timing, never the export time', async () => {
    const { api, history, fetch } = setup()
    const raw = details()
    delete (raw.matchInfo as Partial<typeof raw.matchInfo>).gameStartMillis
    fetch.mockResolvedValue(raw)
    history.mockResolvedValue([{ matchId: 'match-1', gameStartTimeMs: START }])
    expect((await api.fetchRecentMatchTimelines(1)).matches[0].timeline?.startTime).toBe(START)
    history.mockResolvedValue([{ matchId: 'match-1', gameStartTimeMs: null }])
    expect(await api.fetchRecentMatchTimelines(1)).toMatchObject({ ok: false, matches: [{ timeline: null, error: 'match_start_time_missing' }] })
  })

  it('rejects unavailable identity, incomplete matches, and the wrong player/match', async () => {
    const { api, internal, fetch } = setup()
    internal.playerName = null
    expect((await api.fetchRecentMatchTimelines(1)).matches[0].error).toBe('player_identity_missing')
    internal.playerName = 'Tester'
    const raw = details()
    raw.matchInfo.isCompleted = false
    fetch.mockResolvedValue(raw)
    expect((await api.fetchRecentMatchTimelines(1)).matches[0].error).toBe('match_not_completed')
    raw.matchInfo.isCompleted = true
    raw.matchInfo.matchId = 'wrong-match'
    expect((await api.fetchRecentMatchTimelines(1)).matches[0].error).toBe('match_id_mismatch')
    raw.matchInfo.matchId = 'match-1'
    raw.players = raw.players.filter(player => player.subject !== SELF)
    expect((await api.fetchRecentMatchTimelines(1)).matches[0].error).toBe('player_missing_from_match')
  })

  it('continues after one fetch fails and preserves the active match and mode', async () => {
    const { api, internal, history, fetch } = setup()
    const active = emptyMatchData('valorant', 99)
    active.matchId = 'live-match'
    internal.matchData = active
    internal.lastGameMode = 'SWIFTPLAY'
    history.mockResolvedValue([{ matchId: 'failed', gameStartTimeMs: null }, { matchId: 'match-1', gameStartTimeMs: null }])
    fetch.mockRejectedValueOnce(new Error('network_unavailable')).mockResolvedValueOnce(details())
    const result = await api.fetchRecentMatchTimelines(10)
    expect(result.ok).toBe(false)
    expect(result.matches[0].error).toBe('network_unavailable')
    expect(result.matches[1].timeline?.matchId).toBe('match-1')
    expect(internal.matchData).toBe(active)
    expect(internal.lastGameMode).toBe('SWIFTPLAY')
  })

  it.each([[NaN, 10], [Infinity, 10], [-2, 1], [40, 20], [2.9, 2]])('bounds limit %s to %s', async (limit, expected) => {
    const { api, history } = setup()
    await api.fetchRecentMatchTimelines(limit)
    expect(history).toHaveBeenCalledWith(expected)
  })

  it('does not report empty history or missing authentication as a successful export', async () => {
    const { api, history } = setup()
    history.mockResolvedValue([])
    expect(await api.fetchRecentMatchTimelines(10)).toMatchObject({ ok: false, reason: 'no_recent_matches' })
    vi.mocked(api.initAuth).mockResolvedValue(false)
    expect(await api.fetchRecentMatchTimelines(10)).toMatchObject({ ok: false, matches: [] })
  })

  it('clears cached names when Riot switches to an account whose identity cannot be read', async () => {
    const api = new RiotLocalApi()
    const internal = api as unknown as ApiInternals
    Object.assign(internal, { ownPuuid: 'previous', playerName: 'Previous', playerTag: 'OLD' })
    vi.spyOn(api, 'readLockfile').mockReturnValue({ port: 123, password: 'test' })
    vi.spyOn(internal, '_fetchClientVersion').mockResolvedValue()
    vi.spyOn(internal, '_fetchLocal').mockImplementation(async path => {
      if (path === '/entitlements/v1/token') return { subject: SELF, accessToken: 'test', token: 'test' }
      if (path === '/chat/v1/session') return { puuid: 'previous', game_name: 'Previous', game_tag: 'OLD' }
      return {}
    })
    await api.initAuth()
    expect(api.getDiagnostics()).toMatchObject({ ownPuuid: SELF, playerName: null, playerTag: null })
  })
})

describe('saved coaching exports', () => {
  it('keeps unavailable Skirmish damage and economy null, but retains genuine zero-damage rounds', async () => {
    const { api, fetch } = setup()
    const raw = details()
    raw.matchInfo.queueID = 'skirmish2v2'
    raw.roundResults.forEach(r => { r.playerStats[0].damage = [] })
    fetch.mockResolvedValue(raw)
    const t = (await api.fetchRecentMatchTimelines(1)).matches[0].timeline!
    const data = JSON.parse(serializeRecentMatch(t)).match_data
    expect(data.finalStats).toMatchObject({ adr: null, headshotPct: null })
    expect(data.roundSummaries.every((r: { playerDamageDealt: unknown; playerSpent: unknown }) => r.playerDamageDealt === null && r.playerSpent === null)).toBe(true)
    expect(data.coachingFacts.perRound.every((r: { damageDealt: unknown }) => r.damageDealt === null)).toBe(true)
    expect(data.dataQuality.capabilities.averageDamagePerRound).toBe('unavailable')
    fetch.mockResolvedValue(details())
    const competitive = JSON.parse(serializeRecentMatch((await api.fetchRecentMatchTimelines(1)).matches[0].timeline!)).match_data
    expect(competitive.roundSummaries[1].playerDamageDealt).toBe(0)
    expect(competitive.finalStats.adr).toBe(75)
  })

  it('labels Deathmatch total score separately from ACS in every duplicate stats block', async () => {
    const { api, fetch } = setup()
    const raw = details()
    raw.matchInfo.queueID = 'deathmatch'
    Object.assign(raw.players[0].stats, { score: 4835, roundsPlayed: 1 })
    fetch.mockResolvedValue(raw)
    const data = JSON.parse(serializeRecentMatch((await api.fetchRecentMatchTimelines(1)).matches[0].timeline!)).match_data
    const expected = { score: null, totalCombatScore: 4835, scoreKind: 'total_score' }
    expect(data.finalStats).toMatchObject(expected)
    expect(data.teamSnapshot[0]).toMatchObject(expected)
    expect(data.matchDetailsLite.players[0].stats).toMatchObject(expected)
    expect(data.dataQuality.capabilities.competitiveAcs).toBe('not_applicable')
  })

  it('keeps Riot-derived trade and death-location data in coaching uploads', async () => {
    const { api, fetch } = setup()
    const raw = details()
    const k = raw.kills[0]
    // Round 1: enemy kills the player, then an ally kills that enemy 1.5s later (a trade).
    raw.kills[3] = { ...k, killer: 'enemy', victim: SELF, gameTime: 20_000, round: 1, roundTime: 5_000 }
    raw.kills.push({ ...k, killer: 'ally', victim: 'enemy', gameTime: 21_500, round: 1, roundTime: 6_500 })
    Object.assign(raw.players[0].stats, { deaths: 2 })
    Object.assign(raw.players[1].stats, { kills: 1, deaths: 2 })
    Object.assign(raw.players[2].stats, { kills: 2, deaths: 0 })
    fetch.mockResolvedValue(raw)
    const t = (await api.fetchRecentMatchTimelines(1)).matches[0].timeline!
    const upload = prepareMatchDataForUpload(t)!
    expect(upload.dataQuality?.status).toBe('verified_fields_only')
    const death = upload.playerDeaths.find(d => d.round === 1)
    expect(death?.spatial).toMatchObject({ traded: true })
    expect(upload.spatialSummary?.events.length).toBeGreaterThan(0)
    expect(upload.dataQuality?.capabilities.tradeAndIsolationJudgments).toBe('available')
    expect(upload.dataQuality?.excludedFields).not.toContain('playerDeaths[].spatial')
    const exported = JSON.parse(serializeRecentMatch(t)).match_data
    expect(exported.playerDeaths.find((d: { round: number }) => d.round === 1).spatial).toMatchObject({ traded: true })
  })

  it('identifies fallback names in the real upload path', async () => {
    const { api, fetch } = setup()
    const raw = details()
    raw.players[1].gameName = ''
    fetch.mockResolvedValue(raw)
    const t = (await api.fetchRecentMatchTimelines(1)).matches[0].timeline!
    const before = JSON.stringify(t)
    const upload = prepareMatchDataForUpload(t)!
    expect(upload.teamSnapshot[1]).toMatchObject({ summonerName: null, nameSource: 'unavailable' })
    expect(upload.dataQuality).toMatchObject({ status: 'verified_fields_only', localNameSource: 'current_account',
      capabilities: { replayLifeState: 'partial' } })
    expect(JSON.stringify(t)).toBe(before)
  })

  it('does not turn incomplete ability counts into authoritative zeros', async () => {
    const { api, fetch } = setup()
    const raw = details()
    delete (raw.players[0].stats.abilityCasts as Partial<NonNullable<typeof raw.players[0]['stats']['abilityCasts']>>).ultimateCasts
    fetch.mockResolvedValue(raw)
    const data = JSON.parse(serializeRecentMatch((await api.fetchRecentMatchTimelines(1)).matches[0].timeline!)).match_data
    expect(data.coachingFacts.matchAbilityCasts).toBeNull()
    expect(data.teamSnapshot[0].abilityCasts).toBeNull()
    expect(data.matchDetailsLite.players[0].stats.abilityCasts).toBeUndefined()
  })

  it('blocks mismatched source facts and strips them from actual coaching submissions', async () => {
    const { api } = setup()
    const t = (await api.fetchRecentMatchTimelines(1)).matches[0].timeline!
    t.finalStats!.kills = 100
    const upload = prepareMatchDataForUpload(t)!
    expect(upload.dataQuality?.status).toBe('blocked')
    expect(upload.finalStats).toBeNull()
    expect(upload.killEvents).toEqual([])
    expect(upload.matchDetailsLite).toBeNull()
    expect(upload.coachingFacts).toBeUndefined()
    expect(() => serializeRecentMatch(t)).toThrow('coaching_validation_failed')
  })

  it('rejects incorrect event identities even when aggregate counts still match', async () => {
    const { api } = setup()
    const t = (await api.fetchRecentMatchTimelines(1)).matches[0].timeline!
    t.killEvents[0].victimPuuid = 'wrong-player'
    expect(() => serializeRecentMatch(t)).toThrow('event_source_mismatch')
  })

  it('does not turn default coordinates into spike plants in unplanted rounds', async () => {
    const { api, fetch } = setup()
    const raw = details()
    raw.roundResults[1].bombPlanter = ''
    raw.roundResults[1].plantLocation = { x: 0, y: 0 }
    fetch.mockResolvedValue(raw)
    const t = (await api.fetchRecentMatchTimelines(1)).matches[0].timeline!
    const payload = JSON.parse(serializeRecentMatch(t))
    expect(payload.match_data.roundPlants).toHaveLength(1)
    expect(payload.match_data.roundPlants[0].round).toBe(0)
  })

  it('includes coaching facts and scope labels, without fake recording timestamps or VOD offsets', async () => {
    const { api } = setup()
    const t = (await api.fetchRecentMatchTimelines(1)).matches[0].timeline!
    const before = JSON.stringify(t)
    const text = serializeRecentMatch(t)
    const exported = JSON.parse(text)
    expect(exported).toMatchObject({ schemaVersion: 3, hasRecording: false, riot_name: 'Tester', riot_tag: 'EUW', game_start_time_ms: START })
    expect(exported.match_data).toMatchObject({ recordingStartTime: null, matchStartTime: START, startTime: START })
    expect(exported.eventScopes.killEvents).toBe('all_players_match_context')
    expect(exported.match_data.coachingFacts.perRound[0]).toMatchObject({ playerKills: 1, playerDeaths: 1, damageDealt: 150 })
    expect(exported.match_data.matchDetailsLite.matchInfo.gameStartMillis).toBe(START)
    expect(exported.match_data.matchDetailsLite.players[0]).toMatchObject({ gameName: 'Tester', tagLine: 'EUW' })
    expect(exported.match_data.roundReplay.rounds[0].frames[0].t).toBe(10_000)
    expect(exported.match_data.roundReplay.rounds[0].frames[0].v).toBeUndefined()
    expect(text).not.toContain('"videoOffsetMs"')
    expect(text).not.toContain('"videoSyncOffsetMs"')
    expect(JSON.stringify(t)).toBe(before)
  })

  it('saves personal K/D/A, explicit lobby counts and separate run folders', async () => {
    const { api } = setup()
    const result = await api.fetchRecentMatchTimelines(1)
    const root = await mkdtemp(join(tmpdir(), 'upforge-recent-matches-'))
    tempDirs.push(root)
    const first = await saveRecentMatchExports(result, root)
    const second = await saveRecentMatchExports(result, root)
    expect(second).toMatchObject({ ok: true, successfulMatches: 1, failedMatches: 0 })
    expect(second.matches[0]).toMatchObject({ kills: 1, deaths: 1, assists: 1, matchKillEvents: 4, playerKillEvents: 1, coachingStatus: 'verified_fields_only' })
    expect(second.matches[0]).not.toHaveProperty('coachingReady')
    expect(first.folder).not.toBe(second.folder)
    expect(await readRecentMatchReport(root)).toEqual(second)
    expect(JSON.parse(await readFile(join(root, 'summary.json'), 'utf8')).folder).toBe(second.folder)
    expect(JSON.parse(await readFile(second.matches[0].file!, 'utf8')).riot_name).toBe('Tester')
    expect(JSON.parse(await readFile(first.matches[0].file!, 'utf8')).riot_name).toBe('Tester')
  })

  it('marks failed exports and data-quality warnings, rather than reporting a clean success', async () => {
    const { api } = setup()
    const result = await api.fetchRecentMatchTimelines(1)
    const root = await mkdtemp(join(tmpdir(), 'upforge-recent-matches-'))
    tempDirs.push(root)
    result.matches[0].warnings = ['player_kill_event_count_mismatch']
    result.matches.push({ ...result.matches[0], matchId: '../escape' })
    const report = await saveRecentMatchExports(result, root)
    expect(report).toMatchObject({ ok: false, successfulMatches: 0, failedMatches: 2 })
    expect(report.matches[0]).toMatchObject({ ok: false, coachingStatus: 'blocked', file: null })
    expect(report.matches[0].error).toContain('coaching_validation_failed')
    expect(report.matches[1]).toMatchObject({ ok: false, error: 'invalid_match_id', file: null })
  })
})
