import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { matchStats, profileStats } from '../../src/lib/overstep-stats'
import { OverstepBridge, type OverstepRecorder } from './overstep-bridge'
import { parseOverstepPacket, eventVideoMs, syncIssue, eventLabel, type OverstepManifest, type OverstepEvent, type OverstepSession } from '../../src/lib/overstep'

const roots: string[] = []
const bridges: OverstepBridge[] = []
afterEach(async () => { for (const b of bridges.splice(0)) await b.disable(); for (const p of roots.splice(0)) rmSync(p, { recursive: true, force: true }) })
function manifest(): OverstepManifest {
  return { schemaVersion: 2, localProfileId: '11111111-1234-1234-1234-123456789abc', game: 'overstep', matchId: '12345678-1234-1234-1234-123456789abc', build: 'overstep-2026-09-30', ruleset: 'local-3v3-v1', authority: 'local', map: 'breakwater', mapVersion: '1', mode: 'circuit', startedAtMs: Date.now(), playerId: 0, participants: Array.from({ length: 6 }, (_, id) => ({ id, team: id < 3 ? 0 : 1, kind: id === 0 ? 'human' : 'bot' })) }
}
const event = (seq: number, type: OverstepEvent['type'], elapsedMs = seq * 1000, data: Record<string, unknown> = {}): OverstepEvent => ({ seq, type, elapsedMs, matchTimeMs: elapsedMs, round: 1, clockErrorMs: 0, data })
const ended = (seq = 1) => event(seq, 'match_ended', seq * 1000, { reason: 'completed', winner: 0, score: [4, 0] })
const packet = (m: OverstepManifest, events: OverstepEvent[]) => ({ manifest: m, events, sentAtMs: Date.now() })
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'overstep-test-')); roots.push(root)
  const m = manifest(); let anchor = 0
  const video = join(root, 'match.mp4'); writeFileSync(video, 'test recording placeholder, not playable footage')
  const recorder: OverstepRecorder = { busy: vi.fn(() => false), start: vi.fn(async () => {}), anchor: vi.fn(async () => ({ epochMs: m.startedAtMs + anchor * 2000, videoMs: anchor++ * 2000, uncertaintyMs: 5 })), stop: vi.fn(async () => video) }
  const bridge = new OverstepBridge(join(root, 'sessions'), join(root, 'bridge.json'), recorder); bridges.push(bridge)
  return { root, m, video, recorder, bridge }
}
describe('native Overstep contract', () => {
  it('accepts native local match data and rejects wrong build, authority and incomplete participants', () => {
    const p = packet(manifest(), [event(0, 'match_preparing')]); expect(parseOverstepPacket(p)).toEqual(p)
    for (const change of [{ build: 'unknown' }, { schemaVersion: 99 }, { authority: 'server' }, { participants: [] }, { game: 'valorant' }]) expect(() => parseOverstepPacket({ ...p, manifest: { ...p.manifest, ...change } })).toThrow()
  })
  it('rejects malformed events and unsupported kill claims', () => {
    for (const e of [{ ...event(0, 'shot'), data: {} }, { ...event(0, 'kill'), data: { attacker: 0, victim: 3, damage: 34, healthAfter: 66, headshot: false } }, { ...event(0, 'round_started'), elapsedMs: NaN }, { ...event(0, 'plant'), data: { member: 0, site: 4 } }]) expect(() => parseOverstepPacket(packet(manifest(), [e]))).toThrow()
  })
  it('maps only covered events using measured anchors', () => {
    const m = manifest()
    const s: OverstepSession = { manifest: m, state: 'ready', dataState: 'receiving', dataError: null, error: null, syncError: null, videoPath: '/recording.mp4', events: [], anchors: [{ epochMs: m.startedAtMs + 1000, videoMs: 0, uncertaintyMs: 5 }, { epochMs: m.startedAtMs + 3000, videoMs: 2000, uncertaintyMs: 5 }] }
    expect(eventVideoMs(s, event(2, 'round_started', 2000))).toBe(1000)
    expect(eventVideoMs(s, event(0, 'match_started', 0))).toBeNull()
    expect(eventVideoMs(s, event(4, 'round_ended', 4000))).toBeNull()
    expect(eventVideoMs({ ...s, videoPath: null }, event(2, 'round_started', 2000))).toBeNull()
  })
  it.each(['drift', 'pause', 'restart', 'gap', 'uncertain', 'game clock', 'lost continuity'])('rejects %s instead of inventing alignment', reason => {
    const s: OverstepSession = { manifest: manifest(), state: 'ready', dataState: 'receiving', dataError: null, error: null, syncError: null, videoPath: '/recording.mp4', events: [], anchors: [{ epochMs: 10000, videoMs: 0, uncertaintyMs: 5 }, { epochMs: 12000, videoMs: 2000, uncertaintyMs: 5 }] }
    if (reason === 'drift') s.anchors[1].videoMs = 1700
    if (reason === 'pause') s.anchors[1].videoMs = 0
    if (reason === 'restart') s.anchors[1].videoMs = 10
    if (reason === 'gap') s.anchors[1] = { epochMs: 17000, videoMs: 7000, uncertaintyMs: 5 }
    if (reason === 'uncertain') s.anchors[0].uncertaintyMs = 101
    if (reason === 'game clock') s.events = [{ ...event(0, 'match_preparing'), clockErrorMs: 200 }]
    if (reason === 'lost continuity') s.syncError = 'Connection interrupted'
    expect(syncIssue(s)).not.toBeNull()
  })
  it('labels facts without Valorant concepts', () => {
    expect(eventLabel(event(1, 'kill', 1000, { attacker: 0, victim: 3, headshot: true }))).toBe('You eliminated Bot 3 (headshot)')
    expect(eventLabel(event(2, 'plant', 2000, { member: 2, site: 1 }))).toBe('Bot 2 planted at B')
  })
})
describe('recording lifecycle', () => {
  it('records once, acknowledges retries, finalizes video and restores the same timeline', async () => {
    const { bridge, recorder, m, root } = fixture()
    const start = packet(m, [event(0, 'match_preparing')]); bridge.accept(start); bridge.accept(start)
    await vi.waitFor(() => expect(bridge.status().sessions[0].state).toBe('recording'))
    const finish = packet(m, [event(1, 'match_started', 500, { captureState: 'recording' }), ended(2)]); bridge.accept(finish)
    await vi.waitFor(() => expect(bridge.status().sessions[0].state).toBe('ready'))
    bridge.accept(finish)
    expect(recorder.start).toHaveBeenCalledTimes(1); expect(recorder.stop).toHaveBeenCalledTimes(1)
    const restored = new OverstepBridge(join(root, 'sessions'), join(root, 'other.json'), recorder); bridges.push(restored)
    expect(restored.status().sessions[0].events).toHaveLength(3)
    expect(restored.status().sessions[0].videoUrl).toMatch(/^file:/)
  })
  it('rejects event gaps, conflicting duplicates, changed manifests and a competing match', async () => {
    const { bridge, m, recorder } = fixture(); bridge.accept(packet(m, [event(0, 'match_preparing')]))
    expect(() => bridge.accept(packet(m, [event(2, 'round_started')]))).toThrow('gap')
    expect(() => bridge.accept(packet(m, [event(0, 'round_started')]))).toThrow('duplicate')
    expect(() => bridge.accept(packet({ ...m, mode: 'crosscurrent' }, [event(1, 'round_started')]))).toThrow('manifest changed')
    expect(() => bridge.accept(packet({ ...m, matchId: '22222222-1234-1234-1234-123456789abc' }, [event(0, 'match_preparing')]))).toThrow('already active')
    expect(recorder.start).toHaveBeenCalledTimes(1)
  })
  it('does not start from missing match start, stale clocks or an occupied recorder', () => {
    const { bridge, m, recorder } = fixture()
    expect(() => bridge.accept(packet(m, [event(1, 'round_started')]))).toThrow('start')
    expect(() => bridge.accept({ ...packet(m, [event(0, 'match_preparing')]), sentAtMs: 0 })).toThrow('clock')
    vi.mocked(recorder.busy).mockReturnValue(true)
    bridge.accept(packet(m, [event(0, 'match_preparing')]))
    expect(bridge.status().sessions[0].state).toBe('failed')
    expect(recorder.start).not.toHaveBeenCalled()
  })
  it('reports missing video without claiming success', async () => {
    const { bridge, m, recorder } = fixture(); vi.mocked(recorder.stop).mockResolvedValue(null)
    bridge.accept(packet(m, [event(0, 'match_preparing'), ended()]))
    await vi.waitFor(() => expect(bridge.status().sessions[0].state).toBe('incomplete'))
    expect(bridge.status().sessions[0].error).toBe('Recording file is missing.')
  })
  it('retains an explicit startup failure without stopping somebody else’s recording', async () => {
    const { bridge, m, recorder } = fixture(); vi.mocked(recorder.start).mockRejectedValue(new Error('OBS unavailable'))
    bridge.accept(packet(m, [event(0, 'match_preparing')]))
    await vi.waitFor(() => expect(bridge.status().sessions[0].state).toBe('failed'))
    expect(recorder.stop).not.toHaveBeenCalled(); expect(bridge.status().sessions[0].error).toBe('OBS unavailable')
  })
  it('disabling during startup stops exactly its owned recording', async () => {
    const { bridge, m, recorder } = fixture()
    let ready!: () => void; vi.mocked(recorder.start).mockImplementation(() => new Promise(resolve => { ready = resolve }))
    bridge.accept(packet(m, [event(0, 'match_preparing')]))
    const stopping = bridge.disable(); ready(); await stopping
    expect(recorder.stop).toHaveBeenCalledTimes(1); expect(bridge.isBusy()).toBe(false)
    expect(bridge.status().sessions[0].state).toBe('incomplete')
  })
  it('drains telemetry after a failed capture so the next match can start', async () => {
    const { bridge, m, recorder } = fixture(); vi.mocked(recorder.start).mockRejectedValueOnce(new Error('Window unavailable'))
    bridge.accept(packet(m, [event(0, 'match_preparing')]))
    await vi.waitFor(() => expect(bridge.status().sessions[0].state).toBe('failed'))
    bridge.accept(packet(m, [event(1, 'round_started'), ended(2)]))
    expect(bridge.status().sessions[0].events).toHaveLength(3)
    bridge.accept(packet({ ...m, matchId: '22222222-1234-1234-1234-123456789abc' }, [event(0, 'match_preparing')]))
    await vi.waitFor(() => expect(recorder.start).toHaveBeenCalledTimes(2))
  })
  it('serializes simultaneous enable requests', async () => {
    const { bridge } = fixture(); await Promise.all([bridge.enable(), bridge.enable()])
    expect(bridge.status().enabled).toBe(true)
    await bridge.disable(); expect(bridge.status().enabled).toBe(false)
  })
  it('protects the loopback receiver with a session secret and rejects browser origins', async () => {
    const { bridge, root, m } = fixture(); await bridge.enable()
    const connection = JSON.parse(readFileSync(join(root, 'bridge.json'), 'utf8'))
    const url = `http://127.0.0.1:${connection.port}/events`, body = JSON.stringify(packet(m, [event(0, 'match_preparing')]))
    expect((await fetch(url, { method: 'POST', body })).status).toBe(403)
    const headers = { Authorization: `Bearer ${connection.token}` }
    expect((await fetch(url, { method: 'POST', body, headers: { ...headers, Origin: 'https://example.com' } })).status).toBe(403)
    expect((await fetch(url, { method: 'POST', body, headers })).status).toBe(200)
  })
})

describe('mode policy and native statistics API', () => {
  const hit = (seq: number, weapon: 'r04' | 'knife', headshot: boolean, damage: number, healthAfter: number) => event(seq, 'damage', seq * 100, { attacker: 0, victim: 3, weapon, headshot, damage, healthAfter })
  const kill = (seq: number, weapon: 'r04' | 'knife', headshot: boolean) => event(seq, 'kill', seq * 100, { attacker: 0, victim: 3, weapon, headshot, damage: 34, healthAfter: 0 })
  it('skips capture for excluded modes while retaining deduplicated stats and policy after restart', async () => {
    const { bridge, recorder, m, root } = fixture()
    bridge.setRecordingPolicy({ recordedModes: ['crosscurrent'] })
    const events = [event(0, 'match_preparing'), event(1, 'match_started', 10, { captureState: 'skipped' }), hit(2, 'r04', false, 34, 66), hit(3, 'r04', true, 66, 0), kill(4, 'r04', true), hit(5, 'knife', false, 34, 0), kill(6, 'knife', false), ended(7)]
    bridge.accept(packet(m, events)); bridge.accept(packet(m, events))
    expect(recorder.start).not.toHaveBeenCalled()
    const stats = bridge.matchSummaries()[0].players[0]
    expect(stats).toMatchObject({ kills: 2, deaths: 0, hits: 2, headHits: 1, headshotPercentage: 50, headshotKillPercentage: 50, damage: 134, outcome: 'win', kd: null })
    expect(stats.weapons.r04.kills).toBe(1); expect(stats.weapons.knife.kills).toBe(1)
    expect(bridge.playerStats(m.localProfileId)).toMatchObject({ matches: 1, wins: 1, losses: 0, kills: 2, headshotPercentage: 50 })
    expect(bridge.playerStats(m.localProfileId, 'crosscurrent').matches).toBe(0)
    const restored = new OverstepBridge(join(root, 'sessions'), join(root, 'restored.json'), recorder); bridges.push(restored)
    expect(restored.recordingPolicy()).toEqual({ recordedModes: ['crosscurrent'] })
    expect(restored.playerStats(m.localProfileId).kills).toBe(2)
  })
  it('keeps preparing until the recorder confirms readiness, independent of the ordinary countdown', async () => {
    const { bridge, recorder, m } = fixture(); let ready!: () => void
    vi.mocked(recorder.start).mockImplementation(() => new Promise(resolve => { ready = resolve }))
    bridge.accept(packet(m, [event(0, 'match_preparing')]))
    expect(bridge.captureState(m.matchId)).toBe('starting')
    bridge.accept(packet(m, [event(1, 'heartbeat', 5000)]))
    expect(bridge.captureState(m.matchId)).toBe('starting')
    ready(); await vi.waitFor(() => expect(bridge.captureState(m.matchId)).toBe('recording'))
    bridge.accept(packet(m, [event(2, 'match_started', 5100, { captureState: 'recording' }), { ...ended(3), elapsedMs: 6100 }]))
    await vi.waitFor(() => expect(recorder.stop).toHaveBeenCalledTimes(1))
  })
  it('counts wins, losses and draws only for completed matches and keeps missing ratios explicit', () => {
    const { m } = fixture()
    const session = (reason: string, winner: number): OverstepSession => ({ manifest: m, events: [event(0, 'match_preparing'), event(1, 'match_ended', 1000, { reason, winner, score: [0, 0] })], anchors: [], state: 'skipped', dataState: 'receiving', dataError: null, error: null, syncError: null, videoPath: null })
    const summary = profileStats([session('completed', 0), session('completed', 1), session('completed', -1), session('restarted', 0)], m.localProfileId)
    expect(summary).toMatchObject({ matches: 3, wins: 1, losses: 1, draws: 1, abandoned: 1, headshotPercentage: null, kd: null })
    expect(matchStats(session('restarted', 0)).players[0].outcome).toBeNull()
  })
  it('serves authenticated mode policy and stats endpoints and reports startup state to the game', async () => {
    const { bridge, root, m } = fixture(); await bridge.enable()
    const c = JSON.parse(readFileSync(join(root, 'bridge.json'), 'utf8')), base = `http://127.0.0.1:${c.port}`, headers = { Authorization: `Bearer ${c.token}` }
    expect((await fetch(base + '/v1/matches')).status).toBe(403)
    expect((await fetch(base + '/v1/recording-policy', { method: 'PUT', headers, body: JSON.stringify({ recordedModes: ['bad'] }) })).status).toBe(422)
    await fetch(base + '/v1/recording-policy', { method: 'PUT', headers, body: JSON.stringify({ recordedModes: [] }) })
    const response = await fetch(base + '/events', { method: 'POST', headers, body: JSON.stringify(packet(m, [event(0, 'match_preparing'), event(1, 'match_started', 10, { captureState: 'skipped' }), ended(2)])) })
    expect(await response.json()).toEqual({ accepted: true, captureState: 'skipped' })
    const matches = await (await fetch(base + '/v1/matches', { headers })).json()
    expect(matches[0].players[0].outcome).toBe('win')
    const stats = await (await fetch(base + `/v1/players/${m.localProfileId}/stats`, { headers })).json()
    expect(stats.wins).toBe(1)
    const timeline = await (await fetch(base + `/v1/matches/${m.matchId}/events?after=0`, { headers })).json()
    expect(timeline.events.map((e: OverstepEvent) => e.seq)).toEqual([1, 2]); expect(timeline.nextAfter).toBe(2)
    expect((await fetch(base + `/v1/matches/${m.matchId}/events?after=bad`, { headers })).status).toBe(422)
    const capabilities = await (await fetch(base + '/v1/capabilities', { headers })).json()
    expect(capabilities.weapons).toEqual(['r04', 'knife'])
    expect((await fetch(base + `/v1/players/${m.localProfileId}/stats?mode=bad`, { headers })).status).toBe(422)
  })
})

it('counts misses and weights aggregate headshot percentages by hits rather than averaging matches', () => {
  const { bridge, m } = fixture(); bridge.setRecordingPolicy({ recordedModes: [] })
  const shot = (seq: number) => event(seq, 'shot', seq * 100, { member: 0, weapon: 'r04', origin: [0, 0, 0], direction: [1, 0, 0], spreadDegrees: 0, speedCmS: 0, recoveryHeat: 0 })
  const hit = (seq: number, headshot: boolean) => event(seq, 'damage', seq * 100, { attacker: 0, victim: 3, weapon: 'r04', headshot, damage: 34, healthAfter: 66 })
  bridge.accept(packet(m, [event(0, 'match_preparing'), event(1, 'match_started', 1, { captureState: 'skipped' }), shot(2), hit(3, true), ended(4)]))
  const next = { ...m, matchId: '22222222-1234-1234-1234-123456789abc' }
  bridge.accept(packet(next, [event(0, 'match_preparing'), event(1, 'match_started', 1, { captureState: 'skipped' }), shot(2), hit(3, false), shot(4), hit(5, false), shot(6), hit(7, false), shot(8), ended(9)]))
  const total = bridge.playerStats(m.localProfileId)
  expect(total.headshotPercentage).toBe(25)
  expect(total.accuracyPercentage).toBe(80)
  expect(total.weapons.r04.shots).toBe(5)
  expect(total.weapons.knife.headshotPercentage).toBeNull()
})

it('retains stats when preparation arrives too late to capture the beginning', () => {
  const { bridge, recorder, m } = fixture()
  const late = { ...m, startedAtMs: Date.now() - 20000 }
  bridge.accept(packet(late, [event(0, 'match_preparing')]))
  expect(bridge.captureState(m.matchId)).toBe('failed')
  bridge.accept(packet(late, [event(1, 'match_started', 10, { captureState: 'failed' }), ended(2)]))
  expect(bridge.playerStats(m.localProfileId).wins).toBe(1)
  expect(recorder.start).not.toHaveBeenCalled()
})

describe('independent match-data recovery', () => {
  it('marks unfinished stats-only matches interrupted on desktop restart and resumes ordered delivery', () => {
    const { bridge, m, root, recorder } = fixture(); bridge.setRecordingPolicy({ recordedModes: [] })
    bridge.accept(packet(m, [event(0, 'match_preparing'), event(1, 'match_started', 1, { captureState: 'skipped' })]))
    const restored = new OverstepBridge(join(root, 'sessions'), join(root, 'restored.json'), recorder); bridges.push(restored)
    expect(restored.matchSummaries()[0].status).toBe('interrupted')
    expect(restored.playerStats(m.localProfileId).matches).toBe(0)
    restored.accept(packet(m, [event(2, 'heartbeat')]))
    expect(restored.matchSummaries()[0].status).toBe('in_progress')
    restored.accept(packet(m, [ended(3)]))
    expect(restored.playerStats(m.localProfileId).wins).toBe(1)
    expect(recorder.start).not.toHaveBeenCalled()
  })
  it('marks stale stats-only telemetry interrupted without inventing a loss', async () => {
    const { bridge, m } = fixture(); bridge.setRecordingPolicy({ recordedModes: [] }); await bridge.enable()
    bridge.accept(packet(m, [event(0, 'match_preparing')]))
    const now = Date.now.bind(Date)
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now() + 16000)
    try { await vi.waitFor(() => expect(bridge.matchSummaries()[0].status).toBe('interrupted'), { timeout: 2000 }) }
    finally { clock.mockRestore() }
    expect(bridge.playerStats(m.localProfileId)).toMatchObject({ matches: 0, losses: 0, interrupted: 1 })
    bridge.accept(packet(m, [event(1, 'match_started', 17000, { captureState: 'skipped' }), { ...ended(2), elapsedMs: 18000 }]))
    expect(bridge.playerStats(m.localProfileId).wins).toBe(1)
  })
  it('stops reporting a full capture when the saved video is removed', async () => {
    const { bridge, m, video, root } = fixture(); bridge.accept(packet(m, [event(0, 'match_preparing')]))
    await vi.waitFor(() => expect(bridge.captureState(m.matchId)).toBe('recording'))
    bridge.accept(packet(m, [event(1, 'match_started', 500, { captureState: 'recording' }), ended(2)]))
    await vi.waitFor(() => expect(bridge.status().sessions[0].state).toBe('ready'))
    expect(bridge.matchSummaries()[0].recording.capturedFromStart).toBe(true)
    rmSync(video)
    expect(bridge.matchSummaries()[0].recording.capturedFromStart).toBe(false)
    expect(bridge.matchSummaries()[0].recording.videoAvailable).toBe(false)
    expect(bridge.playerStats(m.localProfileId).wins).toBe(1)
    await bridge.enable()
    const script = fileURLToPath(new URL('../../scripts/check-overstep-match.mjs', import.meta.url))
    await expect(promisify(execFile)(process.execPath, [script, '--connection', join(root, 'bridge.json'), '--match', m.matchId])).rejects.toMatchObject({ code: 1 })
  })
})

it('runs the read-only acceptance check against the real HTTP API without changing policy', async () => {
  const { bridge, root, m } = fixture(); bridge.setRecordingPolicy({ recordedModes: [] }); await bridge.enable()
  bridge.accept(packet(m, [event(0, 'match_preparing'), event(1, 'match_started', 1, { captureState: 'skipped' }), ended(2)]))
  const report = join(root, 'acceptance.json')
  const script = fileURLToPath(new URL('../../scripts/check-overstep-match.mjs', import.meta.url))
  const { stdout } = await promisify(execFile)(process.execPath, [script, '--connection', join(root, 'bridge.json'), '--match', m.matchId, '--output', report])
  expect(JSON.parse(stdout).passed).toBe(true)
  expect(JSON.parse(readFileSync(report, 'utf8')).checks).toMatchObject({ completedMatch: true, contiguousEvents: true, killTotalsAgree: true, deathTotalsAgree: true, recordingDecision: true })
  expect(bridge.recordingPolicy()).toEqual({ recordedModes: [] })
})
