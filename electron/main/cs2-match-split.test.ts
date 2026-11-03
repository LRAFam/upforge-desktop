/**
 * Repro for "CS2 keeps saving one match as many matches" (3.2.5, Windows).
 *
 * Replays a realistic GSI sequence for ONE competitive match through the real steam-gsi-server
 * entry point, and drives it with the same loop index.ts uses for CS2:
 *  - wait loop (1 s): start recording when `isGsiMatchLive()`
 *  - gsiPollTimer (2 s): stop recording when `isGsiMatchEnded()` → finishActiveMatch
 *  - finishActiveMatch → rearmGameDetection(game) (3 s, no waitForMatchEnd) → game-started → wait loop
 *    (which calls `resetSteamGsiSession()` first).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }))
vi.mock('./cs2-demo-finder', () => ({ getCandidateCS2CsgoDirs: vi.fn(async () => []) }))
vi.mock('./game-data-capture', () => ({ getGameDataCapture: () => null }))

import {
  ingestGsiBody,
  isGsiMatchEnded,
  isGsiMatchLive,
  resetSteamGsiSession,
} from './steam-gsi-server'

const LOCAL = '76561198000000001'
const MATE = '76561198000000002'

type Phase = 'warmup' | 'live' | 'intermission' | 'gameover'
type Snapshot = {
  /** null → main menu (no map block). */
  map: { name: string; phase: Phase; round: number; ct: number; t: number; mode?: string } | null
  roundPhase?: 'freezetime' | 'live' | 'over'
  /** 'menu' = Esc menu / main menu, 'textinput' = chat / console. */
  activity?: 'playing' | 'menu' | 'textinput'
  /** Dead → GSI describes the player you spectate. */
  spectating?: boolean
}

function body(s: Snapshot, atMs: number): string {
  const player = {
    steamid: s.spectating ? MATE : LOCAL,
    name: s.spectating ? 'mate' : 'me',
    activity: s.activity ?? (s.map ? 'playing' : 'menu'),
    ...(s.map ? { team: 'CT', state: { health: 100 }, match_stats: { kills: 0, deaths: 0, assists: 0 } } : {}),
  }
  return JSON.stringify({
    provider: { name: 'Counter-Strike: Global Offensive', appid: 730, steamid: LOCAL, timestamp: Math.floor(atMs / 1000) },
    ...(s.map ? {
      map: {
        mode: s.map.mode ?? 'competitive', name: s.map.name, phase: s.map.phase, round: s.map.round,
        team_ct: { score: s.map.ct }, team_t: { score: s.map.t },
      },
      round: { phase: s.roundPhase ?? 'live' },
    } : {}),
    player,
  })
}

/** A timeline of GSI POSTs: [atMs, snapshot]. A missing stretch = no POSTs (a GSI gap). */
type Timeline = Array<[number, Snapshot]>

const S = 1000

/** One 24-round competitive Nuke match with every mid-match hazard we know of. */
function oneFullMatch(t0 = 0, opts: { mapName?: string } = {}): { posts: Timeline; endAt: number } {
  const name = opts.mapName ?? 'de_nuke'
  const posts: Timeline = []
  let t = t0
  const at = (dt: number, s: Snapshot) => { posts.push([t + dt, s]) }

  // Main menu → loading (no POSTs) → warmup.
  at(0, { map: null })
  at(10 * S, { map: null, activity: 'menu' })
  t += 40 * S
  for (let i = 0; i < 60; i += 2) at(i * S, { map: { name, phase: 'warmup', round: 0, ct: 0, t: 0 }, roundPhase: 'live' })
  t += 60 * S

  let ct = 0
  let tt = 0
  for (let round = 0; round < 24; round++) {
    const m = (phase: Phase = 'live') => ({ name, phase, round, ct, t: tt })
    // Freeze time (15 s) — Esc menu in round 3, chat in round 7.
    for (let i = 0; i < 15; i += 2) {
      const activity = round === 3 && i >= 4 ? 'menu' : round === 7 ? 'textinput' : 'playing'
      at(i * S, { map: m(), roundPhase: 'freezetime', activity })
    }
    // Live (75 s): die at 30 s in rounds 5/10/20 and spectate a team-mate; a 20 s GSI gap in round 15.
    for (let i = 15; i < 90; i += 2) {
      if (round === 15 && i >= 40 && i < 60) continue
      const dead = [5, 10, 20].includes(round) && i >= 45
      // Dead players often open the Esc menu / scoreboard while spectating.
      const activity = round === 10 && dead ? 'menu' : 'playing'
      at(i * S, { map: m(), roundPhase: 'live', spectating: dead, activity })
    }
    if (round % 2 === 0) ct++; else tt++
    // Round over (7 s).
    for (let i = 90; i < 97; i += 2) at(i * S, { map: { ...m(), ct, t: tt }, roundPhase: 'over' })
    t += 97 * S
    // Halftime after round 12.
    if (round === 11) {
      for (let i = 0; i < 15; i += 2) at(i * S, { map: { name, phase: 'intermission', round: 12, ct, t: tt }, roundPhase: 'over' })
      t += 15 * S
    }
    // Round 18: game crashes back to the main menu, player reconnects 45 s later.
    if (round === 17) {
      for (let i = 0; i < 45; i += 5) at(i * S, { map: null, activity: 'menu' })
      t += 45 * S
    }
  }
  // Game over (score 12-12 isn't a finish, but the sequence only needs a gameover phase) → menu.
  for (let i = 0; i < 20; i += 2) at(i * S, { map: { name, phase: 'gameover', round: 24, ct, t: tt }, roundPhase: 'over' })
  const endAt = t
  t += 20 * S
  at(0, { map: null, activity: 'menu' })
  at(30 * S, { map: null, activity: 'menu' })
  t += 60 * S
  return { posts, endAt }
}

/** Drive the posts through the index.ts CS2 recording loop. Returns recording [start, stop] pairs. */
function runCs2Flow(posts: Timeline, untilMs: number): Array<[number, number | null]> {
  const recordings: Array<[number, number | null]> = []
  type State = { kind: 'waiting' } | { kind: 'recording'; nextPoll: number } | { kind: 'rearm'; at: number }
  let state: State = { kind: 'waiting' }
  resetSteamGsiSession()
  let p = 0
  for (let now = 0; now <= untilMs; now += S) {
    vi.setSystemTime(now)
    while (p < posts.length && posts[p][0] <= now) {
      ingestGsiBody(body(posts[p][1], posts[p][0]), posts[p][0])
      p++
    }
    if (state.kind === 'waiting') {
      if (isGsiMatchLive()) {
        recordings.push([now, null])
        state = { kind: 'recording', nextPoll: now + 2 * S }
      }
    } else if (state.kind === 'recording') {
      if (now >= state.nextPoll) {
        state.nextPoll = now + 2 * S
        if (isGsiMatchEnded()) {
          recordings[recordings.length - 1][1] = now
          state = { kind: 'rearm', at: now + 3 * S }
        }
      }
    } else if (now >= state.at) {
      resetSteamGsiSession()
      state = { kind: 'waiting' }
    }
  }
  return recordings
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
})
afterEach(() => vi.useRealTimers())

describe('CS2 match lifecycle — one real match is one recording', () => {
  it('Esc menu, chat, death/spectate, halftime, a 20 s GSI gap and a reconnect never split the match', () => {
    const { posts, endAt } = oneFullMatch()
    const recs = runCs2Flow(posts, posts[posts.length - 1][0] + 120 * S)
    expect(recs).toHaveLength(1)
    const [start, stop] = recs[0]
    expect(start).toBeLessThan(110 * S)
    expect(stop).not.toBeNull()
    // Stops at game over (poll is every 2 s), not minutes later and not before.
    expect(stop!).toBeGreaterThanOrEqual(endAt)
    expect(stop!).toBeLessThan(endAt + 5 * S)
  })

  it('opening the Esc menu mid-round is not a match end', () => {
    const t = 1_000_000
    resetSteamGsiSession()
    ingestGsiBody(body({ map: { name: 'de_nuke', phase: 'live', round: 4, ct: 2, t: 2 }, roundPhase: 'live' }, t), t)
    ingestGsiBody(body({ map: { name: 'de_nuke', phase: 'live', round: 4, ct: 2, t: 2 }, roundPhase: 'live', activity: 'menu' }, t + S), t + S)
    expect(isGsiMatchEnded()).toBe(false)
    expect(isGsiMatchLive()).toBe(true)
  })

  it('leaving the server for good still ends the match (after the reconnect grace)', () => {
    const name = 'de_mirage'
    const posts: Timeline = []
    for (let i = 0; i < 300; i += 2) posts.push([i * S, { map: { name, phase: 'live', round: Math.floor(i / 100), ct: 1, t: 0 } }])
    // Abandon at 300 s → main menu forever (heartbeats).
    for (let i = 300; i < 600; i += 30) posts.push([i * S, { map: null, activity: 'menu' }])
    const recs = runCs2Flow(posts, 600 * S)
    expect(recs).toHaveLength(1)
    const stop = recs[0][1]
    expect(stop).not.toBeNull()
    expect(stop!).toBeGreaterThan(300 * S)
    expect(stop!).toBeLessThan(300 * S + 3 * 60 * S)
  })

  it('two real matches back to back are still two recordings', () => {
    const a = oneFullMatch(0)
    const lastA = a.posts[a.posts.length - 1][0]
    const b = oneFullMatch(lastA + 30 * S, { mapName: 'de_inferno' })
    const recs = runCs2Flow([...a.posts, ...b.posts], b.posts[b.posts.length - 1][0] + 120 * S)
    expect(recs).toHaveLength(2)
    expect(recs.every(([, stop]) => stop != null)).toBe(true)
  })
})

describe('one owner for the CS2 match flow (3.2.5 log: "app"/"cs2" starts alternating every ~8 s)', () => {
  const tasklist = async (): Promise<string> => '"cs2.exe","123","Console","1","100,000 K"'

  it('re-arming after a match emits game-started once — the detector poll does not start a second flow', async () => {
    const { GameDetector } = await import('./game-detector')
    const detector = new GameDetector({ listProcesses: tasklist })
    const started: string[] = []
    detector.on('game-started', (g: string) => started.push(g))
    await detector.pollOnce() // CS2 opened
    expect(started).toEqual(['cs2'])

    // finishActiveMatch → rearmGameDetection: keep CS2 active while waiting, then one fresh watch.
    detector.reviveActiveGame('cs2')
    await detector.pollOnce()
    detector.rearmWatch('cs2')
    await detector.pollOnce()
    await detector.pollOnce()
    expect(started).toEqual(['cs2', 'cs2'])
  })

  it('the old re-arm (reset active game, then emit) let the poll start a second, competing flow', async () => {
    const { GameDetector } = await import('./game-detector')
    const detector = new GameDetector({ listProcesses: tasklist })
    const started: string[] = []
    detector.on('game-started', (g: string) => started.push(g))
    await detector.pollOnce()
    detector.resetActiveGame('cs2')
    detector.emit('game-started', 'cs2')
    await detector.pollOnce()
    expect(started).toEqual(['cs2', 'cs2', 'cs2'])
  })
})
