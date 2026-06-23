/**
 * Deadlock match detection via console.log tailing.
 * Aligned with community parsers (deadlock-rpc) — -condebug required.
 */

import fs from 'fs'
import path from 'path'
import log from 'electron-log'
import {
  appendDeadlockCombatEvent,
  buildDeadlockLogTimeline,
  type DeadlockLogSessionSnapshot,
} from './deadlock-live-timeline'
import {
  getDeadlockReplayDirsSync,
  resolveDeadlockConsoleLogCandidates,
  resolveDeadlockReplayDirs,
} from './deadlock-paths'
import type { MatchData } from './riot-types'

const HIDEOUT_MAPS = new Set(['dl_hideout'])

type DeadlockPhase = 'idle' | 'match_intro' | 'in_match' | 'post_match' | 'spectating'

let pollTimer: ReturnType<typeof setInterval> | null = null
let activeLogPath: string | null = null
let lastReadPos = 0
let initialized = false
let lastActivityAt = 0
let lastLogLine = ''

let phase: DeadlockPhase = 'idle'
let mapName: string | null = null
let heroKey: string | null = null
let heroWindowOpen = true
let sawLiveMatch = false
let hideoutLoaded = false

let sessionStartAt = 0
let matchStartedAtMs: number | null = null
let trackedReplayPath: string | null = null
let trackedReplaySize = 0
let sawReplayLive = false
let replayStableSince: number | null = null
let lobbyMatchId: number | null = null

const liveKills: DeadlockLogSessionSnapshot['kills'] = []
const liveDeaths: DeadlockLogSessionSnapshot['deaths'] = []

const logPathSizes = new Map<string, { size: number; checkedAt: number }>()

const RE = {
  mapInfo: /\[Client\] Map:\s+"([^"]+)"/,
  mapCreated: /\[Client\] Created physics for\s+(\S+)/,
  lobbyCreated: /Lobby\s+(\d+)\s+for\s+Match\s+(\d+)\s+created/,
  lobbyDestroyed: /Lobby\s+\d+\s+for\s+Match\s+\d+\s+destroyed/,
  loopModeMenu: /LoopMode:\s*menu/,
  changeGameState: /ChangeGameState:\s+(\w+)\s+\((\d+)\)/,
  serverDisconnect: /\[Client\] Disconnecting from server:\s+(\S+)/,
  serverShutdown: /\[Server\] SV:\s+Server shutting down:\s+(\S+)/,
  serverConnect: /\[Client\] CL:\s+Connected to '([^']+)'/,
  precachingHeroes: /Precaching (\d+) heroes in CCitadelGameRules/,
  startMatchmaking: /k_EMsgClientToGCStartMatchmaking/,
  stopMatchmaking: /k_EMsgClientToGCStopMatchmaking/,
  hostActivate: /\[HostStateManager\] Host activate:.*\(([^)]+)\)/,
  spectateBroadcast: /Playing Broadcast/,
  loadedHero: /\[Server\] Loaded hero \d+\/(hero_\w+)/,
  clientHeroVmdl: /VMDL Camera Pose Success!.*models\/heroes(?:_wip|_staging)?\/(\w+)\//,
  appShutdown: /Dispatching EventAppShutdown_t|Source2Shutdown/,
}

function normalizeHeroKey(raw: string): string {
  let s = raw.toLowerCase()
  const us = s.lastIndexOf('_')
  if (us > 0) {
    const suffix = s.slice(us + 1)
    if (suffix.startsWith('v') && suffix.length > 1 && /^\d+$/.test(suffix.slice(1))) {
      s = s.slice(0, us)
    }
  }
  if (!s.startsWith('hero_')) s = `hero_${s}`
  return s
}

function resetState(): void {
  phase = 'idle'
  mapName = null
  heroKey = null
  heroWindowOpen = true
  sawLiveMatch = false
  hideoutLoaded = false
  matchStartedAtMs = null
  trackedReplayPath = null
  trackedReplaySize = 0
  sawReplayLive = false
  replayStableSince = null
  lobbyMatchId = null
  liveKills.length = 0
  liveDeaths.length = 0
}

export function resetDeadlockLogSession(): void {
  sessionStartAt = Date.now()
  resetState()
  seekLogToEnd()
}

function seekLogToEnd(): void {
  if (!activeLogPath) return
  try {
    if (fs.existsSync(activeLogPath)) {
      lastReadPos = fs.statSync(activeLogPath).size
      initialized = true
    }
  } catch {
    initialized = false
    lastReadPos = 0
  }
}

function markMatchStarted(): void {
  if (matchStartedAtMs == null) matchStartedAtMs = Date.now()
}

function applyHeroSignal(key: string): void {
  if (phase === 'spectating') return
  const normalized = normalizeHeroKey(key)

  if (phase === 'match_intro' || phase === 'in_match') {
    if (heroKey && heroKey !== normalized && !heroWindowOpen) return
    heroKey = normalized
    heroWindowOpen = false
    return
  }
  if (phase === 'idle' || phase === 'post_match') return
  heroKey = normalized
}

let cachedReplayDirs: string[] = []
let replayDirsResolvedAt = 0

async function refreshReplayDirsIfStale(): Promise<string[]> {
  if (Date.now() - replayDirsResolvedAt < 30_000 && cachedReplayDirs.length) {
    return cachedReplayDirs
  }
  cachedReplayDirs = await resolveDeadlockReplayDirs()
  replayDirsResolvedAt = Date.now()
  return cachedReplayDirs
}

async function sampleLogPathGrowth(): Promise<Map<string, number>> {
  const growth = new Map<string, number>()
  const now = Date.now()
  const candidates = await resolveDeadlockConsoleLogCandidates()
  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) continue
      const size = fs.statSync(candidate).size
      const prev = logPathSizes.get(candidate)
      if (prev) growth.set(candidate, size - prev.size)
      logPathSizes.set(candidate, { size, checkedAt: now })
    } catch { /* skip */ }
  }
  return growth
}

export async function resolveDeadlockConsoleLog(): Promise<string | null> {
  const growth = await sampleLogPathGrowth()

  const candidates = await resolveDeadlockConsoleLogCandidates()

  let bestGrowing: { path: string; delta: number } | null = null
  let bestMtime = 0
  let bestMtimePath: string | null = null

  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) continue
      const stat = fs.statSync(candidate)
      if (stat.mtimeMs > bestMtime) {
        bestMtime = stat.mtimeMs
        bestMtimePath = candidate
      }

      const delta = growth.get(candidate) ?? 0
      if (delta > 0 && (!bestGrowing || delta > bestGrowing.delta)) {
        bestGrowing = { path: candidate, delta }
      }
    } catch { /* skip */ }
  }

  if (activeLogPath && initialized) {
    const delta = growth.get(activeLogPath) ?? 0
    if (delta > 0) return activeLogPath
  }

  if (bestGrowing) return bestGrowing.path
  return bestMtimePath
}

function isHideoutMap(name: string): boolean {
  return HIDEOUT_MAPS.has(name.toLowerCase())
}

function applyMap(name: string): void {
  const mapLower = name.toLowerCase()
  if (!mapLower || mapLower === 'start' || mapLower === '<empty>' || mapLower === ' ') return
  if (phase === 'spectating') return

  if (isHideoutMap(mapLower)) {
    phase = 'idle'
    mapName = mapLower
    return
  }

  mapName = mapLower
  if (phase === 'match_intro' || phase === 'idle' || phase === 'post_match' || phase === 'in_match') {
    phase = 'in_match'
    sawLiveMatch = true
    hideoutLoaded = false
    markMatchStarted()
  }
}

function processLine(line: string): void {
  const trimmed = line.trim()
  if (!trimmed) return
  lastActivityAt = Date.now()
  lastLogLine = trimmed.slice(0, 240)

  appendDeadlockCombatEvent(
    { kills: liveKills, deaths: liveDeaths },
    trimmed,
    { matchStartTime: matchStartedAtMs, recordingStartTime: matchStartedAtMs ?? sessionStartAt },
    heroKey,
  )

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
    lobbyMatchId = Number.parseInt(m[2], 10)
    heroKey = null
    heroWindowOpen = true
    if (phase === 'idle' || phase === 'post_match' || phase === 'match_intro' || phase === 'in_match') {
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

  if (RE.spectateBroadcast.test(trimmed)) {
    phase = 'spectating'
    hideoutLoaded = false
    return
  }

  if (RE.stopMatchmaking.test(trimmed) && phase === 'match_intro') {
    phase = 'idle'
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
        markMatchStarted()
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

  m = RE.serverShutdown.exec(trimmed)
  if (m?.[1]?.toUpperCase().includes('EXITING')) {
    resetState()
    return
  }

  if (RE.appShutdown.test(trimmed)) {
    resetState()
    return
  }

  if (RE.loopModeMenu.test(trimmed)
    && (phase === 'in_match' || phase === 'match_intro' || phase === 'spectating')) {
    phase = 'post_match'
    return
  }

  m = RE.serverConnect.exec(trimmed)
  if (m && !m[1].toLowerCase().includes('loopback')) {
    heroKey = null
    heroWindowOpen = true
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
  if (m) {
    hideoutLoaded = isHideoutMap(m[1])
    return
  }

  m = RE.loadedHero.exec(trimmed)
  if (m) {
    if (phase !== 'idle' || hideoutLoaded) {
      applyHeroSignal(m[1])
    }
    return
  }

  m = RE.clientHeroVmdl.exec(trimmed)
  if (m) {
    applyHeroSignal(m[1])
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
    lastReadPos = size
    initialized = true
    log.info('[DeadlockLog] Tailing from EOF', logPath, `(size=${size})`)
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

function pollReplayDir(dirs: string[]): void {
  if (!dirs.length) return

  const notBefore = sessionStartAt
  let newest: { path: string; size: number; mtimeMs: number } | null = null

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue
    try {
      for (const entry of fs.readdirSync(dir)) {
        if (!entry.toLowerCase().endsWith('.dem')) continue
        const fullPath = path.join(dir, entry)
        try {
          const stat = fs.statSync(fullPath)
          if (stat.mtimeMs < notBefore || stat.size < 1024) continue
          if (!newest || stat.mtimeMs > newest.mtimeMs) {
            newest = { path: fullPath, size: stat.size, mtimeMs: stat.mtimeMs }
          }
        } catch { /* skip */ }
      }
    } catch { /* skip dir */ }
  }

  if (!newest) return

  if (trackedReplayPath === newest.path && newest.size > trackedReplaySize) {
    sawReplayLive = true
    sawLiveMatch = true
    replayStableSince = null
    trackedReplaySize = newest.size
    markMatchStarted()
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
    markMatchStarted()
  }
}

async function pollOnce(): Promise<void> {
  const replayDirs = await refreshReplayDirsIfStale()
  pollReplayDir(replayDirs.length ? replayDirs : getDeadlockReplayDirsSync())

  if (activeLogPath && initialized && !isDeadlockLogReceiving(45_000)) {
    const refreshed = await resolveDeadlockConsoleLog()
    if (refreshed && refreshed !== activeLogPath) {
      log.info(`[DeadlockLog] Switching log path: ${activeLogPath} → ${refreshed}`)
      activeLogPath = refreshed
      initialized = false
      lastReadPos = 0
    }
  }

  if (!activeLogPath) {
    activeLogPath = await resolveDeadlockConsoleLog()
    if (activeLogPath) {
      log.info('[DeadlockLog] Resolved console.log:', activeLogPath)
    }
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

export function isDeadlockMatchLive(): boolean {
  if (phase === 'in_match' && mapName != null && !isHideoutMap(mapName)) return true
  if (sawReplayLive && trackedReplayPath && !replayStableSince) return true
  if (sawReplayLive && replayStableSince && Date.now() - replayStableSince < 20_000) return true
  return false
}

function isReplayReadyForSession(): boolean {
  if (!sawReplayLive || !trackedReplayPath) return false
  if (!replayStableSince) return true
  return Date.now() - replayStableSince < 20_000
}

export function isDeadlockReadyToRecord(): boolean {
  if (phase === 'in_match' && mapName != null && !isHideoutMap(mapName)) return true
  if (isReplayReadyForSession()) return true
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

export function getDeadlockHero(): string | null {
  return heroKey
}

export function getDeadlockLobbyMatchId(): number | null {
  return lobbyMatchId
}

export function getDeadlockMatchStartedAt(): number | null {
  return matchStartedAtMs
}

export function getDeadlockLogSessionSnapshot(): DeadlockLogSessionSnapshot {
  return {
    heroKey,
    mapName: getDeadlockMap(),
    phase,
    lobbyMatchId,
    matchStartedAtMs,
    kills: [...liveKills],
    deaths: [...liveDeaths],
  }
}

export function buildDeadlockTimelineFromLogSession(
  recordingStartTime: number,
  matchStartTime: number | null,
): MatchData | null {
  return buildDeadlockLogTimeline(
    getDeadlockLogSessionSnapshot(),
    recordingStartTime,
    matchStartTime ?? matchStartedAtMs,
  )
}

export interface DeadlockDetectionDiagnostics {
  phase: DeadlockPhase
  mapName: string | null
  heroKey: string | null
  logPath: string | null
  logReceiving: boolean
  logGrowing: boolean
  lastLogLine: string
  replayLive: boolean
  condebugLikely: boolean
  replayDir: string | null
  readyToRecord: boolean
  matchLive: boolean
  liveKills: number
  liveDeaths: number
  lobbyMatchId: number | null
  logCandidates: Array<{ path: string; size: number; exists: boolean }>
}

export function getDeadlockDetectionStatus(): DeadlockDetectionDiagnostics {
  const dirs = cachedReplayDirs.length ? cachedReplayDirs : getDeadlockReplayDirsSync()
  const replayDir = dirs.find((d) => fs.existsSync(d)) ?? dirs[0] ?? null

  let logGrowing = false
  if (activeLogPath) {
    logGrowing = lastActivityAt > 0 && Date.now() - lastActivityAt < 3_000
  }

  const logCandidates: DeadlockDetectionDiagnostics['logCandidates'] = []
  for (const [p, meta] of logPathSizes.entries()) {
    logCandidates.push({ path: p, size: meta.size, exists: fs.existsSync(p) })
  }
  logCandidates.sort((a, b) => b.size - a.size)

  return {
    phase,
    mapName,
    heroKey,
    logPath: activeLogPath,
    logReceiving: isDeadlockLogReceiving(),
    logGrowing,
    lastLogLine,
    replayLive: sawReplayLive,
    condebugLikely: isDeadlockLogReceiving() || (activeLogPath != null && fs.existsSync(activeLogPath)),
    replayDir,
    readyToRecord: isDeadlockReadyToRecord(),
    matchLive: isDeadlockMatchLive(),
    liveKills: liveKills.length,
    liveDeaths: liveDeaths.length,
    lobbyMatchId,
    logCandidates: logCandidates.slice(0, 8),
  }
}
