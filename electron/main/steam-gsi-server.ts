/**
 * CS2 match detection via Valve Game State Integration (GSI).
 */

import http from 'http'
import { randomBytes, timingSafeEqual } from 'crypto'
import fs from 'fs'
import path from 'path'
import log from 'electron-log'
import { getCandidateCS2CsgoDirs } from './cs2-demo-finder'
import { Cs2GsiTracker, type Cs2GsiPayload } from './cs2-gsi-timeline'
import { getGameDataCapture } from './game-data-capture'
import { GSI_PORT_RANGE_SIZE, gsiPortCandidates, listenOnFirstFreePort } from './steam-gsi-port'

/** Live CS2 events for the current capture (kills / deaths / rounds) — see cs2-gsi-timeline.ts. */
export const cs2GsiTracker = new Cs2GsiTracker()

export const STEAM_GSI_PORT = 3001
/** Port the server is bound to (or will try first) — written into the GSI cfg. */
let activeGsiPort = STEAM_GSI_PORT

export function getActiveGsiPort(): number {
  return activeGsiPort
}
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

/** Largest GSI POST accepted (full diagnostics payloads are ~10-50 KB). */
export const GSI_MAX_BODY_BYTES = 1_000_000

/** Shared secret CS2 echoes back as `auth.token` (set from settings via ensureGsiAuthToken). */
let gsiAuthToken: string | null = null
let staleConfigNoticed = false

const TOKEN_RE = /^[a-f0-9]{64}$/

/** Read the per-install GSI token from settings, creating + persisting one if missing. */
export function ensureGsiAuthToken(store: {
  get(): { cs2GsiAuthToken?: string }
  save(partial: { cs2GsiAuthToken: string }): unknown
}): string {
  let token = store.get().cs2GsiAuthToken
  if (!token || !TOKEN_RE.test(token)) {
    token = randomBytes(32).toString('hex')
    store.save({ cs2GsiAuthToken: token })
  }
  gsiAuthToken = token
  return token
}

export function getGsiAuthToken(): string | null {
  return gsiAuthToken
}

function tokenMatches(candidate: unknown): boolean {
  if (!gsiAuthToken || typeof candidate !== 'string') return false
  const a = Buffer.from(candidate, 'utf8')
  const b = Buffer.from(gsiAuthToken, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

export interface SteamGsiServerOptions {
  /** Defaults to STEAM_GSI_PORT; tests pass 0. */
  port?: number
  /** Overrides the token set by ensureGsiAuthToken. */
  token?: string
  /** Called once per run when CS2 posts without the right token (old cfg — CS2 needs a restart). */
  onStaleConfig?: () => void
  /** Port to try first (last port used, from settings). Defaults to STEAM_GSI_PORT. */
  preferredPort?: number
  /** Fallback range when the preferred port is busy. Defaults to STEAM_GSI_PORT + GSI_PORT_RANGE_SIZE. */
  portRange?: { base: number; size: number }
  /**
   * Bound a different port than preferred (it was busy). The cfg has already been rewritten;
   * a CS2 that is open must restart to pick up the new port. Persist `port` so it stays stable.
   */
  onPortChanged?: (info: { port: number; previousPort: number; cfgUpdated: boolean }) => void
}

export function startSteamGsiServer(opts: SteamGsiServerOptions = {}): http.Server {
  if (server) return server
  if (opts.token) gsiAuthToken = opts.token
  if (!gsiAuthToken) gsiAuthToken = randomBytes(32).toString('hex')
  const preferred = opts.port ?? opts.preferredPort ?? STEAM_GSI_PORT
  if (preferred > 0) activeGsiPort = preferred

  server = http.createServer((req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(405)
      res.end()
      return
    }
    // CS2 never sends Origin; a browser page posting to localhost always does.
    if (req.headers.origin !== undefined) {
      res.writeHead(403)
      res.end()
      req.resume()
      return
    }
    const declared = Number(req.headers['content-length'] ?? 0)
    if (declared > GSI_MAX_BODY_BYTES) {
      res.writeHead(413, { Connection: 'close' })
      res.end()
      req.destroy()
      return
    }
    req.setTimeout(10_000, () => req.destroy())
    const chunks: Buffer[] = []
    let bytes = 0
    let tooLarge = false
    req.on('data', (chunk: Buffer) => {
      if (tooLarge) return
      bytes += chunk.length
      if (bytes > GSI_MAX_BODY_BYTES) {
        tooLarge = true
        res.writeHead(413, { Connection: 'close' })
        res.end()
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (tooLarge) return
      const body = Buffer.concat(chunks).toString('utf8')
      let token: unknown
      try { token = (JSON.parse(body) as { auth?: { token?: unknown } })?.auth?.token } catch { token = undefined }
      if (!tokenMatches(token)) {
        if (!staleConfigNoticed) {
          staleConfigNoticed = true
          log.warn('[SteamGSI] Ignored GSI POST without a valid auth token — if CS2 was running when UpForge updated its config, restart CS2 once so match detection works again')
          try { opts.onStaleConfig?.() } catch { /* notice only */ }
        }
        res.writeHead(401)
        res.end()
        return
      }
      ingestGsiBody(body)
      res.writeHead(200)
      res.end()
    })
  })

  // Put the normal cfg back once a diagnostics capture finishes or is switched off.
  getGameDataCapture()?.onDisarmed(() => { void installSteamGsiConfig('cs2') })

  const srv = server
  // An explicit `port` (tests) is used as-is; otherwise fall back through a small range.
  const range = opts.portRange ?? { base: STEAM_GSI_PORT, size: GSI_PORT_RANGE_SIZE }
  const candidates = opts.port !== undefined ? [opts.port] : gsiPortCandidates(preferred, range.base, range.size)
  void listenOnFirstFreePort(srv, candidates, '127.0.0.1').then(async (bound) => {
    if (server !== srv) return
    if (bound == null) {
      serverListening = false
      serverPortBlocked = true
      log.warn('[SteamGSI] Ports', candidates.join(', '), 'all in use — CS2 match detection will not work')
      return
    }
    serverListening = true
    serverPortBlocked = false
    activeGsiPort = bound
    log.info('[SteamGSI] Listening on 127.0.0.1:' + bound)
    if (opts.port !== undefined || bound === preferred) return
    log.warn('[SteamGSI] Port', preferred, 'in use — using', bound, 'instead; restart CS2 so it posts to the new port')
    const r = await installSteamGsiConfig('cs2').catch(() => ({ ok: false, needsRestart: false }))
    try { opts.onPortChanged?.({ port: bound, previousPort: preferred, cfgUpdated: !!r.needsRestart }) } catch { /* notice only */ }
  }).catch((err) => {
    serverListening = false
    log.warn('[SteamGSI] Server error:', err)
  })
  srv.on('error', (err: NodeJS.ErrnoException) => {
    if (!srv.listening) return // listen errors are handled by listenOnFirstFreePort
    log.warn('[SteamGSI] Server error:', err)
  })
  return server
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

/** Close the server (tests / shutdown). */
export function stopSteamGsiServer(): Promise<void> {
  const s = server
  server = null
  serverListening = false
  staleConfigNoticed = false
  if (!s) return Promise.resolve()
  s.closeAllConnections?.()
  return new Promise((resolve) => s.close(() => resolve()))
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

function authBlock(token: string | null): string {
  if (!token) return ''
  return `    "auth"
    {
        "token" "${token}"
    }
`
}

/** Normal cfg — keep byte-identical per token, or every user's CS2 would be asked to restart. */
function normalGsiCfgContents(token: string | null): string {
  return `"UpForge"
{
    "uri" "http://127.0.0.1:${activeGsiPort}"
${authBlock(token)}    "timeout" "5.0"
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

export function gsiCfgContents(full = false, token: string | null = gsiAuthToken): string {
  if (!full) return normalGsiCfgContents(token)
  const data = FULL_GSI_COMPONENTS.map((c) => `        "${c}" "1"`).join('\n')
  return `"UpForge"
{
    "uri" "http://127.0.0.1:${activeGsiPort}"
${authBlock(token)}    "timeout" "5.0"
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
