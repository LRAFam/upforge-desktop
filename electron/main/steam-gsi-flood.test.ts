/**
 * In-game lag budget for CS2 GSI handling (owner report: "a stupid amount of lag when playing CS2", 3.2.5).
 *
 * Floods the real GSI entry point with full-component payloads (what the 3.2.5 diagnostics cfg asks
 * for: allplayers_*, grenades, bomb, positions) at 20 POST/s for 60 s, with the diagnostics capture
 * armed, and asserts main-thread time per payload stays tiny and nothing does sync disk I/O per POST.
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ capture: null as unknown }))

vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() } }))
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }))
vi.mock('./cs2-demo-finder', () => ({ getCandidateCS2CsgoDirs: vi.fn(async () => []), listRecentCS2Demos: vi.fn(async () => []) }))
vi.mock('./game-data-capture', async (orig) => {
  const real = await orig<typeof import('./game-data-capture')>()
  return { ...real, getGameDataCapture: () => h.capture }
})

import { GameDataCapture } from './game-data-capture'
import { cs2GsiTracker, ingestGsiBody, resetSteamGsiSession } from './steam-gsi-server'

const LOCAL = '76561198000000001'

function fullPayload(i: number, atMs: number): string {
  const allplayers: Record<string, unknown> = {}
  for (let p = 0; p < 10; p++) {
    allplayers[`7656119800000${String(p).padStart(4, '0')}`] = {
      name: `player${p}`, observer_slot: p, team: p < 5 ? 'CT' : 'T',
      state: { health: 100 - (i % 100), armor: 100, helmet: true, flashed: 0, burning: 0, money: 4000 + i, round_kills: 0, round_killhs: 0, equip_value: 5000 },
      match_stats: { kills: i % 30, assists: 2, deaths: 3, mvps: 1, score: 40 },
      weapons: {
        weapon_0: { name: 'weapon_knife', paintkit: 'default', type: 'Knife', state: 'holstered' },
        weapon_1: { name: 'weapon_usp_silencer', paintkit: 'default', type: 'Pistol', ammo_clip: 12, ammo_clip_max: 12, ammo_reserve: 24, state: 'holstered' },
        weapon_2: { name: 'weapon_m4a1_silencer', paintkit: 'cu_m4a1s_hyper_beast', type: 'Rifle', ammo_clip: 20, ammo_clip_max: 20, ammo_reserve: 80, state: 'active' },
        weapon_3: { name: 'weapon_smokegrenade', paintkit: 'default', type: 'Grenade', ammo_reserve: 1, state: 'holstered' },
      },
      position: `${(i * 3.1 + p).toFixed(2)}, ${(-1200.5 + p).toFixed(2)}, -416.00`,
      forward: '0.71, -0.70, -0.02',
    }
  }
  const grenades: Record<string, unknown> = {}
  for (let g = 0; g < 4; g++) {
    grenades[String(400 + g)] = { owner: LOCAL, position: `${g}.0, 1.0, 2.0`, velocity: '0.00, 0.00, 0.00', lifetime: '3.2', type: 'smoke', effecttime: '1.0' }
  }
  return JSON.stringify({
    provider: { name: 'Counter-Strike: Global Offensive', appid: 730, version: 14000, steamid: LOCAL, timestamp: Math.floor(atMs / 1000) },
    map: {
      mode: 'competitive', name: 'de_nuke', phase: 'live', round: Math.floor(i / 200), team_ct: { score: 3, consecutive_round_losses: 0, timeouts_remaining: 1, matches_won_this_series: 0 },
      team_t: { score: 2, consecutive_round_losses: 1, timeouts_remaining: 1, matches_won_this_series: 0 }, num_matches_to_win_series: 0,
      round_wins: { 1: 'ct_win_elimination', 2: 't_win_bomb', 3: 'ct_win_defuse', 4: 'ct_win_time', 5: 't_win_elimination' },
    },
    round: { phase: 'live' },
    player: {
      steamid: LOCAL, name: 'me', observer_slot: 1, team: 'CT', activity: 'playing',
      state: { health: 100, armor: 100, helmet: true, flashed: 0, smoked: 0, burning: 0, money: 4000, round_kills: 0, round_killhs: 0, equip_value: 5000 },
      match_stats: { kills: Math.floor(i / 100), assists: 1, deaths: 2, mvps: 0, score: 20 },
      position: `${(i * 3.1).toFixed(2)}, -1200.50, -416.00`, forward: '0.71, -0.70, -0.02',
    },
    allplayers,
    grenades,
    bomb: { state: 'carried', position: '1.0, 2.0, 3.0', player: '76561198000000007' },
    phase_countdowns: { phase: 'live', phase_ends_in: '84.3' },
    previously: { player: { position: '0, 0, 0' } },
  })
}

let dir = ''
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uf-gsi-flood-'))
})
afterEach(() => {
  vi.restoreAllMocks()
  cs2GsiTracker.stop()
  ;(h.capture as GameDataCapture | null)?.setArmed(false)
  h.capture = null
  fs.rmSync(dir, { recursive: true, force: true })
})

const RATE_PER_S = 20
const SECONDS = 60
const N = RATE_PER_S * SECONDS
/** Main-thread budget per GSI POST (JSON parse + detection + timeline + capture). */
const BUDGET_MS_PER_PAYLOAD = 1

describe('CS2 GSI flood (20 POST/s × 60 s, full components)', () => {
  it('normal handling and an armed diagnostics capture stay under budget with no sync disk I/O per POST', async () => {
    const capture = new GameDataCapture({ dir })
    capture.setArmed(true)
    h.capture = capture
    resetSteamGsiSession()
    cs2GsiTracker.start(0)

    const bodies = Array.from({ length: N }, (_, i) => fullPayload(i, 1_000_000 + i * 50))
    const bytes = bodies.reduce((n, b) => n + b.length, 0)
    const writeSync = vi.spyOn(fs, 'writeSync')
    const appendSync = vi.spyOn(fs, 'appendFileSync')
    const writeFileSync = vi.spyOn(fs, 'writeFileSync')

    // Warm up the JIT like a real match would after the first few seconds.
    for (let i = 0; i < 50; i++) ingestGsiBody(bodies[i], 1_000_000 + i * 50)
    writeSync.mockClear(); appendSync.mockClear(); writeFileSync.mockClear()

    const t0 = performance.now()
    let worst = 0
    for (let i = 50; i < N; i++) {
      const s = performance.now()
      ingestGsiBody(bodies[i], 1_000_000 + i * 50)
      worst = Math.max(worst, performance.now() - s)
    }
    const total = performance.now() - t0
    const perPayload = total / (N - 50)
    console.log(`[gsi-flood] ${N - 50} payloads (${(bytes / N / 1024).toFixed(1)} KB avg) — total ${total.toFixed(1)} ms, ${perPayload.toFixed(3)} ms/payload, worst ${worst.toFixed(2)} ms; writeSync=${writeSync.mock.calls.length} appendFileSync=${appendSync.mock.calls.length} writeFileSync=${writeFileSync.mock.calls.length}`)

    expect(capture.getStatus().active?.game).toBe('cs2')
    expect(perPayload).toBeLessThan(BUDGET_MS_PER_PAYLOAD)
    // Batched async writes only: no synchronous disk I/O on the per-POST path.
    expect(writeSync.mock.calls.length + appendSync.mock.calls.length + writeFileSync.mock.calls.length).toBe(0)

    // Everything still reaches disk once flushed.
    capture.setArmed(false)
    await capture.flushed()
    const file = fs.readdirSync(dir).find((f) => f.startsWith('gsi-'))!
    const lines = fs.readFileSync(path.join(dir, file), 'utf-8').trim().split('\n')
    expect(lines).toHaveLength(N)
    expect(JSON.parse(lines[N - 1]).body.map.name).toBe('de_nuke')
  })
})
