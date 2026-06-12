/**
 * CS2 / Deadlock match detection via Valve Game State Integration (GSI).
 * Process open ≠ in-match — GSI map_phase distinguishes menu from live play.
 */

import http from 'http'
import fs from 'fs'
import path from 'path'
import log from 'electron-log'
import { detectCS2DemoDir } from './cs2-demo-finder'

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
    log.info('[SteamGSI] Listening on 127.0.0.1:' + STEAM_GSI_PORT)
  })
  server.on('error', (err) => {
    log.warn('[SteamGSI] Server error:', err)
  })
}

export function resetSteamGsiSession(): void {
  sawLiveMatch = false
}

export function isGsiReceiving(maxAgeMs = 10_000): boolean {
  if (!latestAt) return false
  return Date.now() - latestAt < maxAgeMs
}

export function isGsiMatchLive(payload: SteamGsiPayload | null = latestPayload): boolean {
  if (!payload?.map?.name) return false
  const mapName = payload.map.name.toLowerCase()
  if (!mapName || mapName === 'menu') return false

  const phase = (payload.map.phase ?? '').toLowerCase()
  if (phase === 'gameover') return false

  return (
    phase === 'live'
    || phase === 'warmup'
    || phase === 'intermission'
    || phase === 'freezetime'
    || phase === 'paused'
  )
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
        "map"               "1"
        "map_phase"         "1"
        "player_activity"   "1"
        "round"             "1"
    }
}
`
}

async function resolveGsiCfgPath(game: 'cs2' | 'deadlock'): Promise<string | null> {
  if (game === 'cs2') {
    const csgoDir = await detectCS2DemoDir()
    if (!csgoDir) return null
    return path.join(csgoDir, 'cfg', GSI_CFG_NAME)
  }
  const local = process.env.LOCALAPPDATA
  if (!local) return null
  return path.join(local, 'Deadlock', 'game', 'deadlock', 'cfg', GSI_CFG_NAME)
}

/** Install GSI cfg so the game POSTs state to UpForge. Requires game restart to load. */
export async function installSteamGsiConfig(
  game: 'cs2' | 'deadlock',
): Promise<{ ok: boolean; cfgPath?: string; needsRestart?: boolean }> {
  const cfgPath = await resolveGsiCfgPath(game)
  if (!cfgPath) {
    log.warn('[SteamGSI] Could not resolve cfg path for', game)
    return { ok: false }
  }

  try {
    const contents = gsiCfgContents()
    const cfgDir = path.dirname(cfgPath)
    if (!fs.existsSync(cfgDir)) fs.mkdirSync(cfgDir, { recursive: true })

    let needsRestart = false
    if (fs.existsSync(cfgPath)) {
      const existing = fs.readFileSync(cfgPath, 'utf-8')
      if (existing.trim() !== contents.trim()) {
        fs.writeFileSync(cfgPath, contents, 'utf-8')
        needsRestart = true
      }
    } else {
      fs.writeFileSync(cfgPath, contents, 'utf-8')
      needsRestart = true
    }

    log.info('[SteamGSI] GSI config ready at', cfgPath)
    return { ok: true, cfgPath, needsRestart }
  } catch (err) {
    log.warn('[SteamGSI] Failed to write cfg:', err)
    return { ok: false }
  }
}
