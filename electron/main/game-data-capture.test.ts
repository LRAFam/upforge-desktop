import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CS2_GAMEOVER_GRACE_MS, GameDataCapture, classifyGsiBody, type CaptureSummary } from './game-data-capture'

let dir: string
let clock: number
const now = (): number => clock

function body(phase: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    provider: { name: 'Counter-Strike 2', steamid: '7656' },
    map: { name: phase === 'menu' ? undefined : 'de_mirage', phase: phase === 'menu' ? undefined : phase },
    ...extra,
  })
}

function readLines(file: string): Array<{ receivedAt: number; preMatch?: boolean; body: Record<string, unknown> }> {
  return fs.readFileSync(path.join(dir, file), 'utf-8').trim().split('\n').map((l) => JSON.parse(l))
}

function readSummary(s: CaptureSummary): CaptureSummary {
  return JSON.parse(fs.readFileSync(path.join(dir, `summary-${s.game}-${s.matchStartedAt}.json`), 'utf-8'))
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uf-capture-'))
  clock = 1_000
})
afterEach(() => {
  vi.useRealTimers()
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('classifyGsiBody', () => {
  it('treats the in-match Esc menu (player.activity=menu) as still live', () => {
    expect(classifyGsiBody({ map: { name: 'de_mirage', phase: 'live' }, player: { activity: 'menu' } })).toBe('live')
    expect(classifyGsiBody({ provider: {} })).toBe('menu')
    expect(classifyGsiBody({ map: { name: 'de_mirage', phase: 'gameover' } })).toBe('gameover')
  })
})

describe('GameDataCapture — CS2', () => {
  it('writes nothing while switched off', () => {
    const c = new GameDataCapture({ dir, env: {}, now })
    c.ingestGsi(body('live'))
    expect(fs.existsSync(dir) ? fs.readdirSync(dir) : []).toEqual([])
    expect(c.wantsFullGsi()).toBe(false)
  })

  it('writes every body of one match as JSON lines, then turns itself off and writes a summary', async () => {
    const c = new GameDataCapture({ dir, env: {}, now })
    const disarmed = vi.fn()
    c.onDisarmed(disarmed)
    c.setArmed(true)
    expect(c.wantsFullGsi()).toBe(true)

    c.ingestGsi(body('menu')) // pre-match, buffered
    clock = 2_000
    c.ingestGsi(body('warmup'))
    clock = 3_000
    c.ingestGsi(body('live', {
      player: { steamid: '7656', state: { health: 100 }, weapons: {}, position: '1, 2, 3' },
      allplayers: { a: { position: '1, 2, 3', weapons: { weapon_0: {} } }, b: { position: '4, 5, 6' } },
      grenades: {},
      bomb: { state: 'carried' },
    }))
    c.ingestGsi('not json')
    clock = 4_000
    c.ingestGsi(body('menu')) // left the server → match over
    await c.flushed() // lines are appended asynchronously in batches

    const lines = readLines('gsi-2000.jsonl')
    expect(lines).toHaveLength(5)
    expect(lines[0]).toMatchObject({ receivedAt: 1_000, preMatch: true })
    expect(lines[1]).toMatchObject({ receivedAt: 2_000, body: { map: { phase: 'warmup' } } })
    expect(lines[3]).toMatchObject({ receivedAt: 3_000, body: 'not json' })

    expect(c.isArmed()).toBe(false)
    expect(c.wantsFullGsi()).toBe(false)
    expect(disarmed).toHaveBeenCalledTimes(1)
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'capture-state.json'), 'utf-8')).armed).toBe(false)

    const s = readSummary(c.getStatus().last!)
    expect(s).toMatchObject({ game: 'cs2', stopReason: 'match-ended', updates: 5, firstAt: 1_000, lastAt: 4_000, maxAllplayers: 2 })
    expect(s.files).toEqual(['gsi-2000.jsonl', 'summary-cs2-2000.json'])
    expect(s.components.provider.count).toBe(4)
    expect(s.components.bomb).toMatchObject({ count: 1, nonEmptyCount: 1, firstAt: 3_000, lastAt: 3_000 })
    expect(s.components.grenades).toMatchObject({ count: 1, nonEmptyCount: 0 })
    expect(s.components.allplayers.nonEmptyCount).toBe(1)
    expect(s.fields['player.position'].nonEmptyCount).toBe(1)
    expect(s.fields['player.weapons'].nonEmptyCount).toBe(0)
    expect(s.fields['allplayers.*.position'].nonEmptyCount).toBe(1)
    expect(s.fields['allplayers.*.weapons'].nonEmptyCount).toBe(1)
    expect(s.components['(unparsed)'].count).toBe(1)
  })

  it('captures only one match', async () => {
    const c = new GameDataCapture({ dir, env: {}, now })
    c.setArmed(true)
    c.ingestGsi(body('live'))
    c.ingestGsi(body('menu'))
    clock = 9_000
    c.ingestGsi(body('live'))
    c.ingestGsi(body('menu'))
    await c.flushed()
    expect(fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl'))).toEqual(['gsi-1000.jsonl'])
  })

  it('keeps the gameover scoreboard for the grace period, then stops', async () => {
    vi.useFakeTimers()
    const c = new GameDataCapture({ dir, env: {}, now })
    c.setArmed(true)
    c.ingestGsi(body('live'))
    c.ingestGsi(body('gameover'))
    expect(c.getStatus().active).not.toBeNull()
    vi.advanceTimersByTime(CS2_GAMEOVER_GRACE_MS)
    expect(c.getStatus().active).toBeNull()
    expect(c.getStatus().last?.stopReason).toBe('match-ended')
    expect(c.isArmed()).toBe(false)
    vi.useRealTimers()
    await c.flushed()
  })

  it('stops at the size guard and turns itself off', async () => {
    const c = new GameDataCapture({ dir, env: {}, now, maxBytes: 600 })
    c.setArmed(true)
    for (let i = 0; i < 20; i++) c.ingestGsi(body('live', { pad: 'x'.repeat(50) }))
    await c.flushed()
    const size = fs.statSync(path.join(dir, 'gsi-1000.jsonl')).size
    expect(size).toBeLessThanOrEqual(600)
    expect(size).toBeGreaterThan(0)
    expect(c.getStatus().last?.stopReason).toBe('size-limit')
    expect(c.isArmed()).toBe(false)
  })

  it('can be armed by UPFORGE_CAPTURE_GAME_DATA=1 and still turns off after one match', async () => {
    const c = new GameDataCapture({ dir, env: { UPFORGE_CAPTURE_GAME_DATA: '1' }, now })
    expect(c.getStatus()).toMatchObject({ armed: true, armedByEnv: true })
    c.ingestGsi(body('live'))
    c.ingestGsi(body('menu'))
    expect(c.isArmed()).toBe(false)
    await c.flushed()
  })

  it('switching off mid-match closes the capture', async () => {
    const c = new GameDataCapture({ dir, env: {}, now })
    c.setArmed(true)
    c.ingestGsi(body('live'))
    c.setArmed(false)
    expect(c.getStatus().last?.stopReason).toBe('switched-off')
    expect(c.wantsFullGsi()).toBe(false)
    await c.flushed()
  })
})

describe('GameDataCapture — Deadlock', () => {
  it('copies console.log lines written during the match, signals, and the metadata fetched later', async () => {
    const consoleLog = path.join(dir, 'console.log')
    fs.writeFileSync(consoleLog, 'old line before match\n')
    const out = path.join(dir, 'out')
    const c = new GameDataCapture({ dir: out, env: {}, now, resolveConsoleLogs: async () => [consoleLog, path.join(dir, 'missing.log')] })
    c.setArmed(true)

    await c.deadlockMatchStarted(42)
    fs.appendFileSync(consoleLog, '[Combat] a killed b\nsecond line\n')
    c.deadlockSignal('steam-cache-salts', { matchId: 42, metadataSalt: 1 })
    clock = 5_000
    c.deadlockMatchEnded()
    await c.flushed()

    expect(c.isArmed()).toBe(false)
    const copied = fs.readFileSync(path.join(out, 'deadlock-console-1000.log'), 'utf-8')
    expect(copied).toContain('[Combat] a killed b')
    expect(copied).not.toContain('old line before match')
    const signals = fs.readFileSync(path.join(out, 'deadlock-signals-1000.jsonl'), 'utf-8').trim().split('\n').map((l) => JSON.parse(l))
    expect(signals.map((s) => s.kind)).toEqual(['match-started', 'steam-cache-salts'])

    c.saveDeadlockMetadata(7, { player: {} }) // other match: ignored
    c.saveDeadlockMetadata(42, { player: { hero_id: 13 } })
    const meta = JSON.parse(fs.readFileSync(path.join(out, 'deadlock-match-1000.json'), 'utf-8'))
    expect(meta).toMatchObject({ matchId: 42, response: { player: { hero_id: 13 } } })

    const s = JSON.parse(fs.readFileSync(path.join(out, 'summary-deadlock-1000.json'), 'utf-8')) as CaptureSummary
    expect(s.deadlock).toMatchObject({ matchId: 42, consoleLines: 2, metadataSaved: true, consoleLogHint: null })
    expect(s.components['steam-cache-salts'].count).toBe(1)
    expect(s.files).toContain('deadlock-match-1000.json')
  })

  it('explains -condebug when no console.log exists', async () => {
    const c = new GameDataCapture({ dir, env: {}, now, resolveConsoleLogs: async () => [path.join(dir, 'nope.log')] })
    c.setArmed(true)
    await c.deadlockMatchStarted(1)
    c.deadlockMatchEnded()
    // The status is filled in after the batched (async) summary write, so wait for it.
    await vi.waitFor(() => expect(c.getStatus().last?.deadlock?.consoleLogHint).toMatch(/-condebug/))
  })

  it('ignores CS2 bodies while a Deadlock capture is running', async () => {
    const c = new GameDataCapture({ dir, env: {}, now })
    c.setArmed(true)
    await c.deadlockMatchStarted(1)
    c.ingestGsi(body('live'))
    expect(fs.readdirSync(dir).some((f) => f.startsWith('gsi-'))).toBe(false)
  })
})

describe('GameDataCapture — research answers (§5)', () => {
  const self = (extra: Record<string, unknown>) => ({ steamid: 'me', team: 'T', ...extra })
  const gsi = (player: Record<string, unknown>, extra: Record<string, unknown> = {}) => JSON.stringify({
    provider: { steamid: 'me', timestamp: 1 },
    map: { name: 'de_mirage', phase: 'live', round: 3, round_wins: { 1: 't_win_elimination', 2: 'ct_win_defuse' } },
    round: { phase: 'live' },
    player,
    ...extra,
  })

  it('answers CS2 questions 1–9 from the GSI stream and 10–12 from after-match events', async () => {
    vi.useFakeTimers()
    const listLocalDemos = vi.fn(async () => [{ name: 'auto0.dem', sizeBytes: 90e6, modifiedAt: 5_000 }])
    const c = new GameDataCapture({ dir, env: {}, now, listLocalDemos })
    c.setArmed(true)
    const weapons = { weapon_1: { name: 'weapon_ak47', state: 'active' } }
    c.ingestGsi(gsi(self({ position: '1, 2, 3', state: { health: 100, round_kills: 0, round_killhs: 0 }, match_stats: { kills: 0 }, weapons }), { bomb: { state: 'carried', position: '1, 2, 3' } }))
    clock = 1_100
    c.ingestGsi(gsi(self({ position: '4, 5, 6', state: { health: 100, round_kills: 1, round_killhs: 1 }, match_stats: { kills: 1 }, weapons }), { phase_countdowns: { phase: 'live', phase_ends_in: '50' } }))
    clock = 1_200
    c.ingestGsi(gsi(self({ position: '4, 5, 6', state: { health: 0, round_kills: 1, round_killhs: 1 }, match_stats: { kills: 1 } })))
    clock = 4_000
    c.ingestGsi(gsi({ steamid: 'mate', team: 'T', state: { health: 80 } }, { allplayers: { mate: {} } }))
    clock = 5_000
    c.ingestGsi(JSON.stringify({ provider: { steamid: 'me' } })) // back in menu → ends

    const a = c.getStatus().last!.answers!
    expect(a[1]).toMatchObject({ selfAliveBodies: 2, selfAliveBodiesWithPosition: 2, distinctSelfPositions: 2, frozen: false })
    expect(a[2]).toMatchObject({ byOwnTeam: { T: { withBomb: 1, withBombPosition: 1, states: ['carried'] } } })
    expect(a[3]).toMatchObject({ reasons: ['t_win_elimination', 'ct_win_defuse'] })
    expect(a[4]).toMatchObject({ bodiesWithPhaseCountdowns: 1, phases: ['live'] })
    expect(a[5]).toMatchObject({ whileAlive: { bodies: 2, allplayers: 0 }, whileDeadOrSpectating: { allplayers: 1 } })
    expect(a[6]).toMatchObject({ spectatingBodies: 1, providerSteamIdStable: true, ownDeaths: 1, deathsFollowedBySwitch: 1, switchDelaysMs: [2_800] })
    expect(a[7]).toMatchObject({ throttleSeconds: 0.2, posts: 5, maxGapMs: 2_800, gapsOver2sWhileRoundLive: 1 })
    expect(a[8]).toMatchObject({ killsSeen: 1, killsWithHeadshotDelta: 1, killsWithActiveWeapon: 1 })
    expect((a[9].killWallClock as Array<Record<string, unknown>>)[0]).toMatchObject({ receivedAt: 1_100, round: 3, activeWeapon: 'weapon_ak47', roundKillHsDelta: 1 })
    expect(a[10]).toMatchObject({ firstMatchWithDemoUrlMsAfterEnd: null })

    clock = 125_000
    await vi.advanceTimersByTimeAsync(120_000)
    expect(listLocalDemos).toHaveBeenCalledWith(1_000)
    c.noteAfterMatch('deadlock', 'cs2-valve-demo', { ok: true }) // wrong game: ignored
    c.noteAfterMatch('cs2', 'cs2-valve-demo', { ok: false, code: 'cs2_running' })
    clock = 305_000
    c.noteAfterMatch('cs2', 'cs2-valve-demo', { ok: true, demoBytes: 120e6 })
    c.noteAfterMatch('cs2', 'cs2-demo-parse', { status: 'ok', durationMs: 9_000, demoBytes: 120e6 })

    const s = readSummary(c.getStatus().last!)
    expect(s.answers![10]).toMatchObject({ firstMatchWithDemoUrlMsAfterEnd: 300_000 })
    expect((s.answers![10].gcLookups as unknown[])).toHaveLength(2)
    expect(s.answers![11]).toMatchObject({ parses: [{ status: 'ok', durationMs: 9_000 }] })
    expect(s.answers![12]).toMatchObject({ localDemos: [{ found: 1 }] })
    expect(s.files).toContain('after-cs2-1000.jsonl')

    clock = 305_000 + 4 * 60 * 60_000
    c.noteAfterMatch('cs2', 'cs2-demo-parse', { status: 'late' }) // outside the 3 h window
    expect((c.getStatus().last!.afterMatch ?? []).length).toBe(4)
  })

  it('Deadlock: polls deadlock-api at most 3 times, times the replay salt + CDN, and censuses console lines', async () => {
    vi.useFakeTimers()
    const consoleLog = path.join(dir, 'console.log')
    fs.writeFileSync(consoleLog, '')
    const out = path.join(dir, 'out')
    const fetchImpl = vi.fn(async (url: string) => ({
      status: url.includes('deadlock-api') ? 429 : 200,
      text: async () => '{}',
    }))
    const c = new GameDataCapture({ dir: out, env: {}, now, fetchImpl, resolveConsoleLogs: async () => [consoleLog] })
    c.setArmed(true)
    await c.deadlockMatchStarted(42)
    fs.appendFileSync(consoleLog, '[Combat] Haze killed Wraith\n[Souls] +120 souls\nplain line\n')
    c.deadlockSignal('replay-file', { size: 10 })
    clock = 2_000
    c.deadlockSignal('replay-file', { size: 20 })
    clock = 3_000
    c.deadlockSignal('replay-file', { size: 20 })
    c.deadlockMatchEnded()

    clock = 33_000
    c.deadlockSignal('steam-cache-salts', { matchId: 42, clusterId: 7, metadataSalt: 1, replaySalt: 99 })
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchImpl).toHaveBeenCalledWith('http://replay7.valve.net/1422450/42_99.dem.bz2', { method: 'HEAD' })

    await vi.advanceTimersByTimeAsync(60 * 60_000)
    const apiCalls = fetchImpl.mock.calls.filter(([u]) => u.includes('deadlock-api'))
    expect(apiCalls).toHaveLength(3)
    expect(fetchImpl.mock.calls.filter(([u]) => u.includes('valve.net'))).toHaveLength(1) // stopped after 200

    const s = c.getStatus().last!
    expect(s.answers![13]).toMatchObject({ written: true, lines: 3, topTags: { Combat: 1, Souls: 1, '(no tag)': 1 } })
    expect(s.answers![15]).toMatchObject({ timedFrom: 'last .dem.partial growth', replaySaltMsAfterEnd: 31_000 })
    expect((s.answers![15].metadataAttempts as unknown[])).toHaveLength(3)
    expect(s.answers![15].replayDownloadableMsAfterEnd).toBe(31_000)
    expect(s.answers![14]).toMatchObject({ observable: false })
  })

  it('saves deadlock-api metadata on the first 200 and stops polling', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn(async () => ({ status: 200, text: async () => '{"match_info":{}}' }))
    const c = new GameDataCapture({ dir, env: {}, now, fetchImpl })
    c.setArmed(true)
    await c.deadlockMatchStarted(42)
    c.deadlockMatchEnded()
    await vi.advanceTimersByTimeAsync(60 * 60_000)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fs.readFileSync(path.join(dir, 'deadlock-api-metadata-1000.json'), 'utf-8')).toBe('{"match_info":{}}')
  })
})
