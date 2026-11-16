import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, expect, it, vi } from 'vitest'
import {
  buildLolLocalMatchPayload,
  countTeamObjectives,
  LOL_LOCAL_MATCH_SCHEMA,
  LolLocalMatchCollector,
  lolGameIdFromMatchId,
  lolLocalReportsEnabled,
  lolPatchFromVersion,
  MAX_LOCAL_EVENTS,
  normalizeLolPosition,
  toLocalEvent,
  type EogStatsBlock,
  type LolLocalIdentity,
} from './lol-local-match'
import {
  LolLocalMatchQueue,
  readLolEndOfGame,
  submitLolLocalMatch,
} from './lol-local-match-service'
import type { LolAllGameData } from './lol-live-client-api'

const fixture = (name: string) => JSON.parse(fs.readFileSync(path.join(__dirname, '__fixtures__', name), 'utf8')) as unknown
const EOG = fixture('lol-eog-stats-block.json') as EogStatsBlock
const LIVE = fixture('lol-live-allgamedata.json') as LolAllGameData
const CONTRACT = fixture('lol-local-match-v1.json') as Record<string, unknown>

const IDENTITY: LolLocalIdentity = {
  puuid: 'fixture-local-puuid',
  gameName: 'Local Player',
  tagLine: 'UPF',
  platformId: 'EUW1',
  gameVersion: '16.22.723.4501',
}

function liveAt(gameTime: number, extra: Partial<LolAllGameData> = {}): LolAllGameData {
  return { ...LIVE, gameData: { ...LIVE.gameData!, gameTime }, ...extra }
}

function collected() {
  const c = new LolLocalMatchCollector()
  c.reset({ matchId: 'EUW1_7381024556', queueId: 420 })
  for (const t of [30, 61, 64, 125, 600.4]) c.ingest(liveAt(t), () => Date.parse('2026-11-15T21:42:10Z'))
  return c
}

describe('LolLocalMatchCollector', () => {
  it('keeps one local snapshot per game minute from activePlayer + local scores', () => {
    const snap = collected().snapshot()
    expect(snap.snapshots.map(s => s.t)).toEqual([61, 125, 600])
    expect(snap.snapshots[0]).toEqual({ t: 61, level: 9, cs: 78, gold_current: 450, kda: [1, 1, 1] })
  })

  it('dedupes events across polls and keeps only contract event types', () => {
    const snap = collected().snapshot()
    expect(snap.events.map(e => e.type)).toEqual([
      'FirstBlood', 'ChampionKill', 'ChampionKill', 'HordeKill', 'DragonKill',
      'ChampionKill', 'TurretKilled', 'ChampionKill', 'Multikill',
    ])
    expect(snap.events[0]).toMatchObject({ t: 214.6, killer: 'Kitsune Main#EUW' })
    expect(snap.events.find(e => e.type === 'DragonKill')?.detail).toEqual({ dragon_type: 'Fire', stolen: false })
    expect(snap.events.find(e => e.type === 'TurretKilled')?.victim).toBe('Turret_T2_R_03_A')
    expect(snap.events.find(e => e.type === 'Multikill')?.detail).toEqual({ kill_streak: 2 })
  })

  it('caps the event list instead of growing without bound', () => {
    const c = new LolLocalMatchCollector()
    c.reset(null)
    const Events = Array.from({ length: MAX_LOCAL_EVENTS + 50 }, (_, i) => ({
      EventID: i, EventName: 'ChampionKill', EventTime: i, KillerName: 'a', VictimName: 'b', Assisters: [],
    }))
    c.ingest(liveAt(1000, { events: { Events } }))
    const snap = c.snapshot()
    expect(snap.events).toHaveLength(MAX_LOCAL_EVENTS)
    expect(snap.eventsTruncated).toBe(true)
  })

  it('records GameEnd result and end time without making it an event', () => {
    const c = new LolLocalMatchCollector()
    c.reset(null)
    c.ingest(liveAt(1834, { events: { Events: [{ EventID: 99, EventName: 'GameEnd', EventTime: 1834, Result: 'Win' }] } }), () => 0)
    const snap = c.snapshot()
    expect(snap.gameEndResult).toBe('win')
    expect(snap.endedAt).toBe('1970-01-01T00:00:00.000Z')
    expect(snap.events).toEqual([])
  })

  it('snapshot is detached from later resets', () => {
    const c = collected()
    const snap = c.snapshot()
    c.reset(null)
    expect(snap.events.length).toBeGreaterThan(0)
  })
})

describe('buildLolLocalMatchPayload', () => {
  const build = (eog: EogStatsBlock | null = EOG, identity = IDENTITY) => buildLolLocalMatchPayload({
    capture: collected().snapshot(), eog, identity, recordingId: 'rec-1', now: () => 0,
  })

  it('emits exactly the contract keys (parity with the shared API fixture)', () => {
    const p = build()!
    expect(Object.keys(p).sort()).toEqual(Object.keys(CONTRACT).sort())
    const contractParticipant = (CONTRACT.participants as Record<string, unknown>[])[0]!
    expect(Object.keys(p.participants[0]!).sort()).toEqual(Object.keys(contractParticipant).sort())
    expect(Object.keys(p.teams[0]!).sort()).toEqual(Object.keys((CONTRACT.teams as object[])[0]!).sort())
    expect(Object.keys(p.local_snapshots[0]!).sort()).toEqual(Object.keys((CONTRACT.local_snapshots as object[])[0]!).sort())
    expect(Object.keys(p.local_player).sort()).toEqual(Object.keys(CONTRACT.local_player as object).sort())
    expect(Object.keys(p.events[0]!).sort()).toEqual(Object.keys((CONTRACT.events as object[])[0]!).sort())
  })

  it('maps EOG stats onto participants (cs = lane minions, neutral separate)', () => {
    const p = build()!
    expect(p.schema).toBe(LOL_LOCAL_MATCH_SCHEMA)
    expect(p).toMatchObject({
      game_id: 7381024556, platform_id: 'EUW1', queue_id: 420, queue_label: 'Ranked Solo/Duo',
      game_mode: 'CLASSIC', map_id: 11, game_length_s: 1834, patch: '16.22', winning_team_id: 100,
      recording_id: 'rec-1', sources: { eog: true, live_events: true, live_snapshots: true },
    })
    const ahri = p.participants[0]!
    expect(ahri).toEqual({
      participant_index: 0, team_id: 100, champion: 'Ahri', champion_id: 103, position: 'MIDDLE',
      riot_id: 'Kitsune Main#EUW', is_local: false, level: 16, kills: 7, deaths: 3, assists: 9,
      cs: 212, neutral_cs: 8, gold_earned: 12450, damage_to_champions: 24100, damage_taken: 18000,
      damage_to_objectives: 6000, vision_score: 22, wards_placed: 9, wards_killed: 3,
      control_wards_bought: 2, items: [6655, 3020, 4645, 3089, 3157, 3340], summoner_spells: [4, 14],
      keystone_id: 8112,
    })
  })

  it('identifies the local player and sends only their puuid', () => {
    const p = build()!
    expect(p.local_player).toEqual({ puuid: 'fixture-local-puuid', riot_id: 'Local Player#UPF', team_id: 100, participant_index: 1 })
    expect(p.participants.filter(x => x.is_local).map(x => x.champion)).toEqual(['Jinx'])
    expect(JSON.stringify(p)).not.toContain('other-player-puuid')
  })

  it('leaves stats null when the client did not report them (no VISION_SCORE / WARD_*)', () => {
    const syndra = build()!.participants.find(x => x.champion === 'Syndra')!
    expect(syndra.vision_score).toBeNull()
    expect(syndra.wards_placed).toBeNull()
    expect(syndra.wards_killed).toBeNull()
    // Empty detectedTeamPosition falls back to selectedPosition.
    expect(syndra.position).toBe('MIDDLE')
  })

  it('counts team objectives from live events and team kills from EOG', () => {
    const p = build()!
    expect(p.teams).toEqual([
      { team_id: 100, kills: 17, towers: 1, dragons: 1, barons: 0, heralds: 0, inhibitors: 0, grubs: 1 },
      { team_id: 200, kills: 9, towers: 0, dragons: 0, barons: 0, heralds: 0, inhibitors: 0, grubs: 0 },
    ])
  })

  it('falls back to a live-only scoreboard when EOG is unavailable', () => {
    const p = build(null)!
    expect(p.sources.eog).toBe(false)
    expect(p.game_id).toBe(7381024556) // from the LCU gameflow match id captured at start
    const jinx = p.participants.find(x => x.is_local)!
    expect(jinx).toMatchObject({ champion: 'Jinx', team_id: 100, kills: 1, deaths: 1, assists: 1, keystone_id: 8008, champion_id: null })
    expect(jinx.cs).toBeNull()
    expect(jinx.gold_earned).toBeNull()
    expect(p.winning_team_id).toBeNull()
  })

  it('ignores a stale EOG block from a different game', () => {
    const p = build({ ...EOG, gameId: 111 })!
    expect(p.sources.eog).toBe(false)
    expect(p.game_id).toBe(7381024556)
  })

  it('returns null without platform or local puuid (required by the contract)', () => {
    expect(build(EOG, { ...IDENTITY, platformId: null })).toBeNull()
    expect(build(EOG, { ...IDENTITY, puuid: null })).toBeNull()
  })

  it('uses the local WIN stat when no team is flagged as winner', () => {
    const teams = EOG.teams!.map(t => ({ ...t, isWinningTeam: undefined }))
    expect(build({ ...EOG, teams })!.winning_team_id).toBe(100)
  })
})

describe('helpers', () => {
  it('normalizes positions, patch and match ids', () => {
    expect(normalizeLolPosition('SUPPORT')).toBe('UTILITY')
    expect(normalizeLolPosition('NONE')).toBeNull()
    expect(lolPatchFromVersion('16.22.723.4501')).toBe('16.22')
    expect(lolPatchFromVersion('')).toBeNull()
    expect(lolGameIdFromMatchId('EUW1_7381024556')).toBe(7381024556)
    expect(lolGameIdFromMatchId('nope')).toBeNull()
  })

  it('maps Ace to acing team id and drops unknown event names', () => {
    expect(toLocalEvent({ EventID: 1, EventName: 'Ace', EventTime: 10, Acer: 'X#1', AcingTeam: 'CHAOS' }))
      .toMatchObject({ killer: 'X#1', detail: { acing_team: 200 } })
    expect(toLocalEvent({ EventID: 2, EventName: 'InhibRespawned', EventTime: 10 })).toBeNull()
  })

  it('credits destroyed structures to the other team', () => {
    const counts = countTeamObjectives([
      { t: 1, type: 'InhibKilled', killer: null, victim: 'Barracks_T1_C1', assisters: [], detail: null },
    ], [])
    expect(counts.get(200)?.inhibitors).toBe(1)
    expect(counts.get(100)?.inhibitors).toBe(0)
  })

  it('feature flag is on only when the API says true', () => {
    expect(lolLocalReportsEnabled({ features: { lol_local_reports: true } })).toBe(true)
    expect(lolLocalReportsEnabled({ features: { lol_local_reports: 'true' } })).toBe(false)
    expect(lolLocalReportsEnabled({})).toBe(false)
    expect(lolLocalReportsEnabled(null)).toBe(false)
  })
})

describe('readLolEndOfGame', () => {
  function lcu(phases: string[], eog: unknown) {
    const calls: string[] = []
    let i = 0
    const get = vi.fn(async (_l: unknown, p: string) => {
      calls.push(p)
      if (p === '/lol-gameflow/v1/gameflow-phase') return phases[Math.min(i++, phases.length - 1)]
      if (p === '/lol-end-of-game/v1/eog-stats-block') {
        if (eog === 404) throw new Error('HTTP 404')
        return eog
      }
      if (p === '/lol-summoner/v1/current-summoner') return { puuid: 'fixture-local-puuid', gameName: 'Local Player', tagLine: 'UPF' }
      if (p === '/lol-platform-config/v1/namespaces/LoginDataPacket/platformId') return 'EUW1'
      if (p === '/lol-patch/v1/game-version') return '16.22.723.4501'
      throw new Error('unexpected ' + p)
    }) as unknown as <T>(l: unknown, p: string) => Promise<T>
    return { get, calls }
  }

  it('waits through InProgress/WaitingForStats then reads the block on EndOfGame', async () => {
    const { get, calls } = lcu(['InProgress', 'WaitingForStats', 'EndOfGame'], EOG)
    const res = await readLolEndOfGame({ findLockfile: () => ({}), get, sleep: async () => {} })
    expect(res.eog?.gameId).toBe(7381024556)
    expect(res.identity).toEqual(IDENTITY)
    expect(calls.filter(c => c.includes('eog-stats-block'))).toHaveLength(1)
  })

  it('gives up when the client moved on and the block is gone', async () => {
    const { get } = lcu(['Lobby'], 404)
    const res = await readLolEndOfGame({ findLockfile: () => ({}), get, sleep: async () => {} })
    expect(res.eog).toBeNull()
    expect(res.identity.puuid).toBe('fixture-local-puuid')
  })

  it('times out while the block never appears', async () => {
    let t = 0
    const { get } = lcu(['PreEndOfGame'], 404)
    const res = await readLolEndOfGame(
      { findLockfile: () => ({}), get, sleep: async (ms) => { t += ms }, now: () => t },
      { timeoutMs: 10_000, pollMs: 3_000 },
    )
    expect(res.eog).toBeNull()
  })

  it('returns empty identity without a lockfile', async () => {
    const res = await readLolEndOfGame({ findLockfile: () => null, get: vi.fn() as never })
    expect(res).toEqual({ eog: null, identity: { puuid: null, gameName: null, tagLine: null, platformId: null, gameVersion: null } })
  })
})

describe('LolLocalMatchQueue + submitLolLocalMatch', () => {
  const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lol-local-')), 'pending.json')
  const payload = () => buildLolLocalMatchPayload({ capture: collected().snapshot(), eog: EOG, identity: IDENTITY, now: () => 0 })!

  it('keeps a failed upload on disk and sends it on the next flush', async () => {
    const file = tmpFile()
    let now = 1_000
    const post = vi.fn().mockRejectedValueOnce(Object.assign(new Error('down'), { status: 503 })).mockResolvedValue({})
    const q = new LolLocalMatchQueue({ file, post, currentUserId: () => 7, now: () => now, schedule: () => null })
    expect(await q.submit(7, payload())).toBe('queued')
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toHaveLength(1)

    // Survives an app restart.
    const q2 = new LolLocalMatchQueue({ file, post, currentUserId: () => 7, now: () => now, schedule: () => null })
    now += 10_000
    await q2.flush()
    expect(post).toHaveBeenCalledTimes(2)
    expect(q2.pendingCount).toBe(0)
  })

  it('drops non-retryable validation errors and never posts to another account', async () => {
    const post = vi.fn().mockRejectedValue(Object.assign(new Error('bad'), { status: 422 }))
    const q = new LolLocalMatchQueue({ file: tmpFile(), post, currentUserId: () => 7, schedule: () => null })
    expect(await q.submit(7, payload())).toBe('dropped')

    const post2 = vi.fn()
    const q2 = new LolLocalMatchQueue({ file: tmpFile(), post: post2, currentUserId: () => 8, schedule: () => null })
    expect(await q2.submit(7, payload())).toBe('queued')
    expect(post2).not.toHaveBeenCalled()
  })

  it('is a no-op (no LCU reads) when the API flag is off', async () => {
    const readEndOfGame = vi.fn()
    const submit = vi.fn()
    const res = await submitLolLocalMatch({
      enabled: () => false, currentUserId: () => 7, readEndOfGame, queue: { submit, flush: vi.fn() },
    }, collected().snapshot())
    expect(res).toBe('disabled')
    expect(readEndOfGame).not.toHaveBeenCalled()
    expect(submit).not.toHaveBeenCalled()
  })

  it('submits the built payload with the recording id resolved after the EOG wait', async () => {
    const submit = vi.fn().mockResolvedValue('sent')
    const res = await submitLolLocalMatch({
      enabled: () => true,
      currentUserId: () => 7,
      readEndOfGame: async () => ({ eog: EOG, identity: IDENTITY }),
      queue: { submit, flush: vi.fn() },
    }, collected().snapshot(), () => 'rec-42')
    expect(res).toBe('sent')
    expect(submit).toHaveBeenCalledWith(7, expect.objectContaining({ game_id: 7381024556, recording_id: 'rec-42' }))
  })

  it('reports incomplete instead of posting when identity is missing', async () => {
    const submit = vi.fn()
    const res = await submitLolLocalMatch({
      enabled: () => true,
      currentUserId: () => 7,
      readEndOfGame: async () => ({ eog: EOG, identity: { ...IDENTITY, puuid: null } }),
      queue: { submit, flush: vi.fn() },
    }, collected().snapshot())
    expect(res).toBe('incomplete')
    expect(submit).not.toHaveBeenCalled()
  })
})
