/**
 * Deadlock match detection via console.log tailing.
 * Deadlock does not expose CS2-style GSI — community tools use -condebug log parsing.
 */

import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import log from 'electron-log'
import { getReplayDirForGame } from './source-replay-finder'

const execAsync = promisify(exec)
const IS_WIN = process.platform === 'win32'
const DEADLOCK_APP_ID = '1422450'
const CONSOLE_LOG_SUFFIX = path.join('game', 'citadel', 'console.log')
const RESYNC_BYTES = 10 * 1024 * 1024
const HIDEOUT_MAPS = new Set(['dl_hideout'])

type DeadlockPhase = 'idle' | 'match_intro' | 'in_match' | 'post_match' | 'spectating'

let pollTimer: ReturnType<typeof setInterval> | null = null
let activeLogPath: string | null = null
let lastReadPos = 0
let initialized = false
let lastActivityAt = 0

let phase: DeadlockPhase = 'idle'
let mapName: string | null = null
let sawLiveMatch = false
let hideoutLoaded = false

let sessionStartAt = 0
let trackedReplayPath: string | null = null
let trackedReplaySize = 0
let sawReplayLive = false
let replayStableSince: number | null = null
let lobbyMatchId: number | null = null

const RE = {
  mapInfo: /\[Client\] Map:\s+"([^"]+)"/,
  mapCreated: /\[Client\] Created physics for\s+(\S+)/,
  lobbyCreated: /Lobby\s+\d+\s+for\s+Match\s+(\d+)\s+created/,
  lobbyDestroyed: /Lobby\s+\d+\s+for\s+Match\s+\d+\s+destroyed/,
  loopModeMenu: /LoopMode:\s*menu/,
  changeGameState: /ChangeGameState:\s+(\w+)\s+\((\d+)\)/,
  serverDisconnect: /\[Client\] Disconnecting from server:\s+(\S+)/,
  serverConnect: /\[Client\] CL:\s+Connected to '([^']+)'/,
  precachingHeroes: /Precaching (\d+) heroes in CCitadelGameRules/,
  startMatchmaking: /k_EMsgClientToGCStartMatchmaking/,
  hostActivate: /\[HostStateManager\] Host activate:.*\(([^)]+)\)/,
  spectate: /spectat/i,
}

function resetState(): void {
  phase = 'idle'
  mapName = null
  sawLiveMatch = false
  hideoutLoaded = false
  trackedReplayPath = null
  trackedReplaySize = 0
  sawReplayLive = false
  replayStableSince = null
  lobbyMatchId = null
}

export function resetDeadlockLogSession(): void {
  sessionStartAt = Date.now()
  resetState()
}

function parseLibraryFolders(vdfPath: string): string[] {
  try {
    const content = fs.readFileSync(vdfPath, 'utf-8')
    const paths: string[] = []
    const re = /"path"\s+"([^"]+)"/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(content)) !== null) {
      paths.push(m[1].replace(/\\\\/g, '\\'))
    }
    return paths
  } catch {
    return []
  }
}

async function getSteamPath(): Promise<string | null> {
  if (!IS_WIN) return null
  try {
    const { stdout } = await execAsync(
      'reg query "HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam" /v InstallPath',
      { windowsHide: true, timeout: 5000 },
    )
    const match = /InstallPath\s+REG_SZ\s+(.+)/i.exec(stdout)
    if (match) return match[1].trim()
  } catch {
    try {
      const { stdout } = await execAsync(
        'reg query "HKLM\\SOFTWARE\\Valve\\Steam" /v InstallPath',
        { windowsHide: true, timeout: 5000 },
      )
      const match = /InstallPath\s+REG_SZ\s+(.+)/i.exec(stdout)
      if (match) return match[1].trim()
    } catch { /* ignore */ }
  }
  return null
}

async function resolveConsoleLogCandidates(): Promise<string[]> {
  const candidates: string[] = []
  const local = process.env.LOCALAPPDATA
  if (local) {
    candidates.push(path.join(local, 'Deadlock', 'game', 'citadel', 'console.log'))
    candidates.push(path.join(local, 'Deadlock', 'game', 'deadlock', 'console.log'))
  }

  const steamPath = await getSteamPath()
  const libraries = steamPath
    ? [steamPath, ...parseLibraryFolders(path.join(steamPath, 'steamapps', 'libraryfolders.vdf'))]
    : []

  for (const lib of libraries) {
    candidates.push(path.join(lib, 'steamapps', 'common', 'Deadlock', CONSOLE_LOG_SUFFIX))
    try {
      const manifest = path.join(lib, 'steamapps', `appmanifest_${DEADLOCK_APP_ID}.acf`)
      if (!fs.existsSync(manifest)) continue
      const text = fs.readFileSync(manifest, 'utf-8')
      const dirMatch = /"installdir"\s+"([^"]+)"/i.exec(text)
      if (dirMatch) {
        candidates.push(path.join(lib, 'steamapps', 'common', dirMatch[1], CONSOLE_LOG_SUFFIX))
      }
    } catch { /* ignore */ }
  }

  if (steamPath) {
    candidates.push(path.join(steamPath, 'steamapps', 'common', 'Deadlock', CONSOLE_LOG_SUFFIX))
  }

  return [...new Set(candidates)]
}

export async function resolveDeadlockConsoleLog(): Promise<string | null> {
  for (const candidate of await resolveConsoleLogCandidates()) {
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

function isHideoutMap(name: string): boolean {
  return HIDEOUT_MAPS.has(name.toLowerCase())
}

function applyMap(name: string): void {
  const mapLower = name.toLowerCase()
  if (!mapLower || mapLower === 'start' || mapLower === ' ') return
  if (phase === 'spectating') return

  if (isHideoutMap(mapLower)) {
    phase = 'idle'
    mapName = mapLower
    hideoutLoaded = false
    return
  }

  mapName = mapLower
  if (phase === 'match_intro' || phase === 'idle' || phase === 'post_match' || phase === 'in_match') {
    phase = 'in_match'
    sawLiveMatch = true
    hideoutLoaded = false
  }
}

function processLine(line: string): void {
  const trimmed = line.trim()
  if (!trimmed) return
  lastActivityAt = Date.now()

  let m = RE.mapCreated.exec(trimmed)
  if (m) {
    applyMap(m[1])
    return
  }

  m = RE.mapInfo.exec(trimmed)
  if (m) {
    applyMap(m[1])
    return
  }

  m = RE.lobbyCreated.exec(trimmed)
  if (m) {
    lobbyMatchId = Number.parseInt(m[1], 10)
    if (phase === 'idle' || phase === 'post_match' || phase === 'match_intro') {
      phase = 'match_intro'
    }
    return
  }

  if (RE.lobbyDestroyed.test(trimmed)) {
    if (phase === 'in_match' || phase === 'match_intro') {
      phase = 'post_match'
    }
    return
  }

  if (RE.spectate.test(trimmed)) {
    phase = 'spectating'
    return
  }

  m = RE.changeGameState.exec(trimmed)
  if (m) {
    const name = m[1].toLowerCase()
    const id = Number.parseInt(m[2], 10)
    const onMatchMap = mapName != null && !isHideoutMap(mapName)
    if (phase !== 'spectating' && (onMatchMap || !hideoutLoaded)) {
      if (name === 'matchintro' || id === 4) {
        phase = 'match_intro'
      } else if (name === 'gameinprogress' || name === 'inprogress' || id === 7) {
        phase = 'in_match'
        sawLiveMatch = true
      } else if (name === 'postgame' || id === 6) {
        phase = 'post_match'
      }
    }
    return
  }

  m = RE.serverDisconnect.exec(trimmed)
  if (m) {
    const reason = m[1].toUpperCase()
    if (reason.includes('EXITING')) {
      resetState()
    } else if (!reason.includes('LOOPDEACTIVATE')
      && (phase === 'in_match' || phase === 'match_intro' || phase === 'spectating')) {
      phase = 'post_match'
    }
    return
  }

  if (RE.loopModeMenu.test(trimmed)
    && (phase === 'in_match' || phase === 'match_intro' || phase === 'spectating')) {
    phase = 'post_match'
    return
  }

  m = RE.serverConnect.exec(trimmed)
  if (m && !m[1].toLowerCase().includes('loopback')) {
    if (phase !== 'spectating' && phase !== 'in_match') {
      phase = 'match_intro'
    }
    return
  }

  m = RE.precachingHeroes.exec(trimmed)
  if (m && Number.parseInt(m[1], 10) > 0) {
    hideoutLoaded = false
    if (phase === 'idle' || phase === 'match_intro') {
      phase = 'match_intro'
    }
    return
  }

  if (RE.startMatchmaking.test(trimmed) && (phase === 'idle' || phase === 'post_match')) {
    phase = 'match_intro'
    return
  }

  m = RE.hostActivate.exec(trimmed)
  if (m && !isHideoutMap(m[1])) {
    hideoutLoaded = false
  }
}

function readNewLines(logPath: string): void {
  let size = 0
  try {
    size = fs.statSync(logPath).size
  } catch {
    initialized = false
    lastReadPos = 0
    activeLogPath = null
    return
  }

  if (!initialized) {
    const start = size > RESYNC_BYTES ? size - RESYNC_BYTES : 0
    const chunk = readFrom(logPath, start, start > 0)
    for (const line of chunk) processLine(line)
    lastReadPos = size
    initialized = true
    log.info('[DeadlockLog] Tailing', logPath, `(${chunk.length} resync lines)`)
    return
  }

  if (size < lastReadPos) {
    initialized = false
    lastReadPos = 0
    return
  }

  if (size <= lastReadPos) return

  for (const line of readFrom(logPath, lastReadPos, false)) {
    processLine(line)
  }
  lastReadPos = size
}

function readFrom(logPath: string, offset: number, skipPartial: boolean): string[] {
  try {
    const fd = fs.openSync(logPath, 'r')
    const size = fs.fstatSync(fd).size
    const start = Math.min(offset, size)
    const length = size - start
    if (length <= 0) {
      fs.closeSync(fd)
      return []
    }
    const buf = Buffer.alloc(length)
    fs.readSync(fd, buf, 0, length, start)
    fs.closeSync(fd)
    const lines = buf.toString('utf-8').split(/\r?\n/)
    if (skipPartial && lines.length > 0) lines.shift()
    return lines
  } catch {
    return []
  }
}

function pollReplayDir(): void {
  const dir = getReplayDirForGame('deadlock')
  if (!dir || !fs.existsSync(dir)) return

  const notBefore = sessionStartAt - 120_000
  let newest: { path: string; size: number; mtimeMs: number } | null = null

  try {
    for (const entry of fs.readdirSync(dir)) {
      if (!entry.toLowerCase().endsWith('.dem')) continue
      const fullPath = path.join(dir, entry)
      try {
        const stat = fs.statSync(fullPath)
        if (stat.mtimeMs < notBefore || stat.size < 4096) continue
        if (!newest || stat.mtimeMs > newest.mtimeMs) {
          newest = { path: fullPath, size: stat.size, mtimeMs: stat.mtimeMs }
        }
      } catch { /* skip */ }
    }
  } catch { return }

  if (!newest) return

  if (trackedReplayPath === newest.path && newest.size > trackedReplaySize) {
    sawReplayLive = true
    sawLiveMatch = true
    replayStableSince = null
    trackedReplaySize = newest.size
    return
  }

  if (trackedReplayPath === newest.path && newest.size === trackedReplaySize) {
    if (sawReplayLive && !replayStableSince) replayStableSince = Date.now()
    return
  }

  if (trackedReplayPath !== newest.path || newest.size > trackedReplaySize) {
    trackedReplayPath = newest.path
    trackedReplaySize = newest.size
    sawReplayLive = true
    sawLiveMatch = true
    replayStableSince = null
  }
}

async function pollOnce(): Promise<void> {
  pollReplayDir()
  if (!activeLogPath) {
    activeLogPath = await resolveDeadlockConsoleLog()
  }
  if (activeLogPath) readNewLines(activeLogPath)
}

export function startDeadlockLogWatcher(): void {
  if (pollTimer) return
  void pollOnce()
  pollTimer = setInterval(() => { void pollOnce() }, 500)
  log.info('[DeadlockLog] Watcher started')
}

export function stopDeadlockLogWatcher(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  activeLogPath = null
  initialized = false
  lastReadPos = 0
}

export function isDeadlockLogAvailable(): boolean {
  return activeLogPath != null && fs.existsSync(activeLogPath)
}

/** Log file exists and has been written recently. */
export function isDeadlockLogReceiving(maxAgeMs = 30_000): boolean {
  if (!activeLogPath || !fs.existsSync(activeLogPath)) return false
  if (lastActivityAt && Date.now() - lastActivityAt < maxAgeMs) return true
  try {
    const mtime = fs.statSync(activeLogPath).mtimeMs
    return Date.now() - mtime < maxAgeMs
  } catch {
    return false
  }
}

export function isDeadlockDetectionActive(): boolean {
  return isDeadlockLogReceiving() || sawReplayLive
}

/** Match is loading (lobby, hero select, server connect) — UI hint only. */
export function isDeadlockMatchLive(): boolean {
  if (phase === 'in_match' || phase === 'match_intro') return true
  if (sawReplayLive && trackedReplayPath && !replayStableSince) return true
  if (sawReplayLive && replayStableSince && Date.now() - replayStableSince < 20_000) return true
  return false
}

/** Stricter gate for OBS recording — map loaded / demo writing, not main menu or queue lobby. */
export function isDeadlockReadyToRecord(): boolean {
  if (phase === 'in_match') return true
  if (sawReplayLive && trackedReplayPath && !replayStableSince) return true
  if (sawReplayLive && replayStableSince && Date.now() - replayStableSince < 20_000) return true
  return false
}

export function isDeadlockMatchEnded(): boolean {
  if (!sawLiveMatch) return false

  if (phase === 'post_match' || (phase === 'idle' && mapName != null && isHideoutMap(mapName))) {
    return true
  }

  if (sawReplayLive && replayStableSince && Date.now() - replayStableSince >= 20_000) {
    return true
  }

  return false
}

export function getDeadlockMap(): string | null {
  if (!mapName || isHideoutMap(mapName)) return null
  return mapName
}

/** Lobby match id from -condebug log (deadlock-api match_id when indexed). */
export function getDeadlockLobbyMatchId(): number | null {
  return lobbyMatchId
}

export function getDeadlockDetectionStatus(): {
  phase: DeadlockPhase
  mapName: string | null
  logPath: string | null
  logReceiving: boolean
  replayLive: boolean
} {
  return {
    phase,
    mapName,
    logPath: activeLogPath,
    logReceiving: isDeadlockLogReceiving(),
    replayLive: sawReplayLive,
  }
}
