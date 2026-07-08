/**
 * CS2 match detection via Valve Game State Integration (GSI).
 */

import http from 'http'
import fs from 'fs'
import path from 'path'
import log from 'electron-log'
import { getCandidateCS2CsgoDirs } from './cs2-demo-finder'

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
      try {
        const payload = JSON.parse(body) as SteamGsiPayload
        latestPayload = payload
        latestAt = Date.now()
        if (isGsiMatchLive(payload)) sawLiveMatch = true
      } catch {
        /* ignore malformed payloads */
      }
      res.writeHead(200)
      res.end()
    })
  })

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

export function isGsiServerReady(): boolean {
  return serverListening
}

export function isGsiPortBlocked(): boolean {
  return serverPortBlocked
}

export function resetSteamGsiSession(): void {
  sawLiveMatch = false
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

const LIVE_ROUND_PHASES = new Set(['live', 'freezetime'])

export function isGsiMatchLive(payload: SteamGsiPayload | null = latestPayload): boolean {
  if (!payload?.map?.name) return false
  const mapName = payload.map.name.toLowerCase()
  if (!mapName || mapName === 'menu') return false

  const phase = (payload.map.phase ?? '').toLowerCase()
  if (phase === 'gameover') return false
  if (LIVE_MAP_PHASES.has(phase)) return true

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

/** True after a live match was seen and GSI reports return to menu / game over. */
export function isGsiMatchEnded(payload: SteamGsiPayload | null = latestPayload): boolean {
  if (!sawLiveMatch || !payload) return false

  const phase = (payload.map?.phase ?? '').toLowerCase()
  if (phase === 'gameover') return true

  const mapName = (payload.map?.name ?? '').toLowerCase()
  if (mapName === 'menu') return true

  const activity = (payload.player?.activity ?? '').toLowerCase()
  return activity === 'menu'
}

function gsiCfgContents(): string {
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
        "player_id"     "1"
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
    const contents = gsiCfgContents()
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
