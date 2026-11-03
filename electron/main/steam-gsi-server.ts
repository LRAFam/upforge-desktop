/**
 * CS2 match detection via Valve Game State Integration (GSI).
 */

import http from 'http'
import fs from 'fs'
import path from 'path'
import log from 'electron-log'
import { getCandidateCS2CsgoDirs } from './cs2-demo-finder'
import { Cs2GsiTracker, type Cs2GsiPayload } from './cs2-gsi-timeline'
import { getGameDataCapture } from './game-data-capture'

/** Live CS2 events for the current capture (kills / deaths / rounds) — see cs2-gsi-timeline.ts. */
export const cs2GsiTracker = new Cs2GsiTracker()

export const STEAM_GSI_PORT = 3001
const GSI_CFG_NAME = 'gamestate_integration_upforge.cfg'

export interface SteamGsiPayload {
  map?: { name?: string; phase?: string; mode?: string }
  player?: { activity?: string }
  round?: { phase?: string }
}

let server: http.Server | null = null
let latestPayload: SteamGsiPayload | null = null
let latestAt = 0
let sawLiveMatch = false
/** Map the live match is on (lower-case); a different live map means a new match. */
let liveMapName: string | null = null
/** First POST with no map (main menu / disconnected) since the match was last live. */
let leftServerAt: number | null = null
let sawGameover = false
let switchedMap = false

/**
 * Leaving the server (main menu, crash, disconnect) only ends the match after this long without a
 * map, so a reconnect to the same match keeps one recording instead of splitting it.
 */
export const CS2_LEFT_SERVER_GRACE_MS = 90_000
let serverListening = false
let serverPortBlocked = false

export function startSteamGsiServer(): void {
  if (server) return

  server = http.createServer((req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(405)
      res.end()
      return
    }
    let body = ''
    req.on('data', (chunk) => { body += String(chunk) })
    req.on('end', () => {
      ingestGsiBody(body)
      res.writeHead(200)
      res.end()
    })
  })

  // Put the normal cfg back once a diagnostics capture finishes or is switched off.
  getGameDataCapture()?.onDisarmed(() => { void installSteamGsiConfig('cs2') })

  server.listen(STEAM_GSI_PORT, '127.0.0.1', () => {
    serverListening = true
    serverPortBlocked = false
    log.info('[SteamGSI] Listening on 127.0.0.1:' + STEAM_GSI_PORT)
  })
  server.on('error', (err: NodeJS.ErrnoException) => {
    serverListening = false
    if (err.code === 'EADDRINUSE') {
      serverPortBlocked = true
      log.warn('[SteamGSI] Port', STEAM_GSI_PORT, 'already in use — CS2 match detection will not work')
    } else {
      log.warn('[SteamGSI] Server error:', err)
    }
  })
}

/** One GSI POST body (what the HTTP handler receives). Exported so tests can replay real sequences. */
export function ingestGsiBody(body: string, at: number = Date.now()): void {
  let payload: SteamGsiPayload | null = null
  try { payload = JSON.parse(body) as SteamGsiPayload } catch { /* malformed — capture still keeps the raw text */ }
  // Diagnostics capture (off by default). Parsed once here; capture reuses it.
  try { getGameDataCapture()?.ingestGsi(body, payload ?? null) } catch { /* never block detection */ }
  if (!payload || typeof payload !== 'object') return
  latestPayload = payload
  latestAt = at
  noteMatchLifecycle(payload, at)
  try { cs2GsiTracker.ingest(payload as Cs2GsiPayload, at) } catch { /* timeline only */ }
}

export function isGsiServerReady(): boolean {
  return serverListening
}

export function isGsiPortBlocked(): boolean {
  return serverPortBlocked
}

export function resetSteamGsiSession(): void {
  sawLiveMatch = false
  liveMapName = null
  leftServerAt = null
  sawGameover = false
  switchedMap = false
}

function noteMatchLifecycle(payload: SteamGsiPayload, at: number): void {
  const mapName = (payload.map?.name ?? '').toLowerCase()
  const phase = (payload.map?.phase ?? '').toLowerCase()
  if (!mapName || mapName === 'menu') {
    if (sawLiveMatch && leftServerAt == null) leftServerAt = at
    return
  }
  if (phase === 'gameover') {
    if (sawLiveMatch) sawGameover = true
    return
  }
  if (!isGsiMatchLive(payload)) return
  if (sawLiveMatch && liveMapName && liveMapName !== mapName) switchedMap = true
  sawLiveMatch = true
  liveMapName ??= mapName
  leftServerAt = null
}

export function isGsiReceiving(maxAgeMs = 35_000): boolean {
  if (!latestAt) return false
  return Date.now() - latestAt < maxAgeMs
}

export function hasEverReceivedGsi(): boolean {
  return latestAt > 0
}

const LIVE_MAP_PHASES = new Set([
  'live',
  'warmup',
  'intermission',
  'freezetime',
  'paused',
])

const LIVE_ROUND_PHASES = new Set(['live', 'freezetime', 'over'])

export function isGsiMatchLive(payload: SteamGsiPayload | null = latestPayload): boolean {
  if (!payload?.map?.name) return false
  const mapName = payload.map.name.toLowerCase()
  if (!mapName || mapName === 'menu') return false

  const phase = (payload.map.phase ?? '').toLowerCase()
  if (phase === 'gameover') return false
  if (LIVE_MAP_PHASES.has(phase)) return true
  // On a map with an unknown phase (e.g. a tactical timeout) — still in the match.
  if (phase) return true

  // Some CS2 builds omit map.phase briefly; round.phase is a reliable fallback.
  const roundPhase = (payload.round?.phase ?? '').toLowerCase()
  return LIVE_ROUND_PHASES.has(roundPhase)
}

export function getLatestGsiMap(): string | null {
  const name = latestPayload?.map?.name
  if (!name || name.toLowerCase() === 'menu') return null
  return name
}

export function getLatestGsiPayload(): SteamGsiPayload | null {
  return latestPayload
}

export type GsiMatchEndReason = 'gameover' | 'left-server' | 'map-changed'

/**
 * Why the live match is over, or null while it is still on. A match ends only on game over, a
 * switch to a different map, or no map for CS2_LEFT_SERVER_GRACE_MS (left / crashed without
 * reconnecting). Never on `player.activity === 'menu'` (the in-match Esc menu), chat, death /
 * spectating (`player` becomes the spectated player), halftime, round over, or a GSI gap.
 * Closing CS2 is handled by the process watcher.
 */
export function gsiMatchEndReason(now: number = Date.now()): GsiMatchEndReason | null {
  if (!sawLiveMatch) return null
  if (sawGameover) return 'gameover'
  if (switchedMap) return 'map-changed'
  if (leftServerAt != null && now - leftServerAt >= CS2_LEFT_SERVER_GRACE_MS) return 'left-server'
  return null
}

/** True after a live match was seen and GSI reports it finished (see gsiMatchEndReason). */
export function isGsiMatchEnded(now: number = Date.now()): boolean {
  return gsiMatchEndReason(now) != null
}

/** Every CS2 GSI component — only requested while a diagnostics capture is armed. */
export const FULL_GSI_COMPONENTS = [
  'provider', 'map', 'round', 'player_id', 'player_state', 'player_weapons', 'player_match_stats',
  'player_position', 'allplayers_id', 'allplayers_state', 'allplayers_match_stats', 'allplayers_weapons',
  'allplayers_position', 'bomb', 'grenades', 'phase_countdowns', 'map_round_wins',
] as const

/** Normal cfg — keep byte-identical, or every user's CS2 would be asked to restart. */
function normalGsiCfgContents(): string {
  return `"UpForge"
{
    "uri" "http://127.0.0.1:${STEAM_GSI_PORT}"
    "timeout" "5.0"
    "buffer"  "0.1"
    "throttle" "0.5"
    "heartbeat" "30.0"
    "data"
    {
        "provider"      "1"
        "map"           "1"
        "round"         "1"
        "map_round_wins" "1"
        "player_id"     "1"
        "player_state"  "1"
        "player_match_stats" "1"
    }
}
`
}

export function gsiCfgContents(full = false): string {
  if (!full) return normalGsiCfgContents()
  const data = FULL_GSI_COMPONENTS.map((c) => `        "${c}" "1"`).join('\n')
  return `"UpForge"
{
    "uri" "http://127.0.0.1:${STEAM_GSI_PORT}"
    "timeout" "5.0"
    "buffer"  "0.1"
    "throttle" "0.2"
    "heartbeat" "5.0"
    "data"
    {
${data}
    }
}
`
}

async function resolveGsiCfgPaths(game: 'cs2' | 'deadlock'): Promise<string[]> {
  if (game === 'cs2') {
    const csgoDirs = await getCandidateCS2CsgoDirs()
    return csgoDirs.map((dir) => path.join(dir, 'cfg', GSI_CFG_NAME))
  }
  const local = process.env.LOCALAPPDATA
  if (!local) return []
  return [path.join(local, 'Deadlock', 'game', 'deadlock', 'cfg', GSI_CFG_NAME)]
}

function writeGsiCfg(cfgPath: string, contents: string): boolean {
  const cfgDir = path.dirname(cfgPath)
  if (!fs.existsSync(cfgDir)) fs.mkdirSync(cfgDir, { recursive: true })

  if (fs.existsSync(cfgPath)) {
    const existing = fs.readFileSync(cfgPath, 'utf-8')
    if (existing.trim() === contents.trim()) return false
  }

  fs.writeFileSync(cfgPath, contents, 'utf-8')
  return true
}

/** Install GSI cfg so the game POSTs state to UpForge. Requires game restart to load. */
export async function installSteamGsiConfig(
  game: 'cs2' | 'deadlock',
): Promise<{ ok: boolean; cfgPaths?: string[]; needsRestart?: boolean }> {
  const cfgPaths = await resolveGsiCfgPaths(game)
  if (!cfgPaths.length) {
    log.warn('[SteamGSI] Could not resolve cfg path for', game)
    return { ok: false }
  }

  try {
    const contents = gsiCfgContents(game === 'cs2' && (getGameDataCapture()?.wantsFullGsi() ?? false))
    let needsRestart = false
    const written: string[] = []

    for (const cfgPath of cfgPaths) {
      const changed = writeGsiCfg(cfgPath, contents)
      if (changed) needsRestart = true
      written.push(cfgPath)
      log.info('[SteamGSI] GSI config ready at', cfgPath)
    }

    return { ok: true, cfgPaths: written, needsRestart }
  } catch (err) {
    log.warn('[SteamGSI] Failed to write cfg:', err)
    return { ok: false }
  }
}
