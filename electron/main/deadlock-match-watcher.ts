/**
 * Deadlock match detection via Steam HTTP cache + replay folder signals.
 * Replaces fragile -condebug console.log tailing.
 */

import fs from 'fs'
import path from 'path'
import log from 'electron-log'
import {
  getDeadlockReplayDirsSync,
  resolveDeadlockReplayDirs,
} from './deadlock-paths'
import {
  logSteamCacheDiagnostics,
  mergeSalts,
  scanSteamHttpCache,
  type DeadlockMatchSalts,
} from './deadlock-steam-cache'
import {
  buildDeadlockLogTimeline,
  type DeadlockLogSessionSnapshot,
} from './deadlock-live-timeline'
import type { MatchData } from './riot-types'

type DeadlockPhase = 'idle' | 'waiting' | 'in_match' | 'post_match'

export const DEADLOCK_CACHE_POLL_MS = 10_000
const REPLAY_STABLE_MS = 20_000
const MIN_PARTIAL_BYTES = 1024

let pollTimer: ReturnType<typeof setInterval> | null = null
let sessionStartAt = 0
let waitStartedAt = 0
let lastCacheScanAt = 0
let lastActivityAt = 0

let phase: DeadlockPhase = 'idle'
let activeMatchId: number | null = null
let matchSalts: DeadlockMatchSalts | null = null
let matchStartedAtMs: number | null = null
let heroId: number | null = null

let trackedPartialPath: string | null = null
let trackedPartialSize = 0
let partialStableSince: number | null = null
let sawPartialLive = false
/** After manual stop — ignore the current lobby/match until Steam reports a new match_id. */
let suppressAutoRecordUntilNewMatch = false

const knownMatchIds = new Set<number>()
const saltsByMatch = new Map<number, DeadlockMatchSalts>()

function resetState(): void {
  phase = 'idle'
  activeMatchId = null
  matchSalts = null
  matchStartedAtMs = null
  heroId = null
  trackedPartialPath = null
  trackedPartialSize = 0
  partialStableSince = null
  sawPartialLive = false
}

export function resetDeadlockLogSession(): void {
  sessionStartAt = Date.now()
  waitStartedAt = sessionStartAt
  lastCacheScanAt = sessionStartAt - 60_000
  resetState()
  knownMatchIds.clear()
  saltsByMatch.clear()
  phase = 'waiting'
}

export function noteDeadlockWaitStarted(): void {
  waitStartedAt = Date.now()
  if (phase === 'idle') phase = 'waiting'
}

function markMatchStarted(matchId: number): void {
  if (activeMatchId === matchId && matchStartedAtMs != null) return
  activeMatchId = matchId
  matchSalts = saltsByMatch.get(matchId) ?? { matchId, clusterId: 0, metadataSalt: null, replaySalt: null }
  if (matchStartedAtMs == null) matchStartedAtMs = Date.now()
  phase = 'in_match'
  lastActivityAt = Date.now()
  log.info('[DeadlockMatch] Live — match_id=', matchId)
}

function markMatchEnded(): void {
  if (phase !== 'in_match' && phase !== 'waiting') return
  phase = 'post_match'
  lastActivityAt = Date.now()
  log.info('[DeadlockMatch] Ended — match_id=', activeMatchId)
}

function applyCacheSalts(salts: DeadlockMatchSalts): void {
  lastActivityAt = Date.now()
  const prev = saltsByMatch.get(salts.matchId) ?? null
  const merged = mergeSalts(prev, salts)
  saltsByMatch.set(salts.matchId, merged)

  const isNew = !knownMatchIds.has(salts.matchId)
  if (isNew) {
    knownMatchIds.add(salts.matchId)
    if (suppressAutoRecordUntilNewMatch) {
      suppressAutoRecordUntilNewMatch = false
      log.info('[DeadlockMatch] New match_id — auto-record re-enabled')
    }
  }

  if (salts.metadataSalt != null && (isNew || activeMatchId == null)) {
    markMatchStarted(salts.matchId)
  }

  if (salts.replaySalt != null) {
    matchSalts = merged
    if (activeMatchId === salts.matchId || activeMatchId == null) {
      activeMatchId = salts.matchId
      markMatchEnded()
    }
  } else if (activeMatchId === salts.matchId) {
    matchSalts = merged
  }
}

function pollPartialReplays(dirs: string[]): void {
  const notBefore = sessionStartAt
  let newest: { path: string; size: number; mtimeMs: number } | null = null

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue
    try {
      for (const entry of fs.readdirSync(dir)) {
        const lower = entry.toLowerCase()
        if (!lower.endsWith('.dem.partial') && !lower.endsWith('.dem')) continue
        const fullPath = path.join(dir, entry)
        try {
          const stat = fs.statSync(fullPath)
          if (stat.mtimeMs < notBefore || stat.size < MIN_PARTIAL_BYTES) continue
          if (!newest || stat.mtimeMs > newest.mtimeMs) {
            newest = { path: fullPath, size: stat.size, mtimeMs: stat.mtimeMs }
          }
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }

  if (!newest) return

  if (lowerEndsWith(newest.path, '.dem') && !lowerEndsWith(newest.path, '.partial')) {
    sawPartialLive = true
    if (phase === 'in_match') markMatchEnded()
    return
  }

  if (trackedPartialPath === newest.path && newest.size > trackedPartialSize) {
    sawPartialLive = true
    partialStableSince = null
    trackedPartialSize = newest.size
    return
  }

  if (trackedPartialPath === newest.path && newest.size === trackedPartialSize) {
    if (sawPartialLive && !partialStableSince) partialStableSince = Date.now()
    return
  }

  trackedPartialPath = newest.path
  trackedPartialSize = newest.size
  sawPartialLive = true
  partialStableSince = null
}

function lowerEndsWith(filePath: string, suffix: string): boolean {
  return filePath.toLowerCase().endsWith(suffix)
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

async function pollOnce(): Promise<void> {
  const scanStartedAt = Date.now()
  const notBefore = Math.max(sessionStartAt, lastCacheScanAt)
  const hits = await scanSteamHttpCache(notBefore)
  lastCacheScanAt = nextDeadlockCacheScanAt(lastCacheScanAt, scanStartedAt)
  for (const hit of hits) applyCacheSalts(hit)

  const replayDirs = await refreshReplayDirsIfStale()
  pollPartialReplays(replayDirs.length ? replayDirs : getDeadlockReplayDirsSync())
}

export function startDeadlockLogWatcher(): void {
  if (pollTimer) return
  if (sessionStartAt === 0) resetDeadlockLogSession()
  void logSteamCacheDiagnostics()
  void pollOnce()
  pollTimer = setInterval(() => { void pollOnce() }, DEADLOCK_CACHE_POLL_MS)
  log.info('[DeadlockMatch] Watcher started (Steam httpcache)')
}

export function nextDeadlockCacheScanAt(previous: number, scanStartedAt: number): number {
  return Math.max(previous, scanStartedAt)
}

export function stopDeadlockLogWatcher(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  resetState()
  sessionStartAt = 0
}

export function isDeadlockLogAvailable(): boolean {
  return pollTimer != null
}

export function isDeadlockLogReceiving(maxAgeMs = 30_000): boolean {
  return lastActivityAt > 0 && Date.now() - lastActivityAt < maxAgeMs
}

export function isDeadlockDetectionActive(): boolean {
  return isDeadlockLogReceiving() || phase === 'in_match' || sawPartialLive
}

export function isDeadlockMatchLive(): boolean {
  if (phase === 'in_match') return true
  if (sawPartialLive && trackedPartialPath && !partialStableSince) return true
  if (sawPartialLive && partialStableSince && Date.now() - partialStableSince < REPLAY_STABLE_MS) {
    return true
  }
  return false
}

export function suppressDeadlockAutoRecordUntilNewMatch(): void {
  suppressAutoRecordUntilNewMatch = true
  log.info('[DeadlockMatch] Auto-record suppressed until next match')
}

export function isDeadlockAutoRecordSuppressed(): boolean {
  return suppressAutoRecordUntilNewMatch
}

export function isDeadlockReadyToRecord(): boolean {
  if (suppressAutoRecordUntilNewMatch) return false
  return phase === 'in_match' && activeMatchId != null
}

export function isDeadlockMatchEnded(): boolean {
  if (phase === 'post_match') return true

  if (matchSalts?.replaySalt != null) return true

  if (sawPartialLive && partialStableSince && Date.now() - partialStableSince >= REPLAY_STABLE_MS) {
    return true
  }

  return false
}

export function getDeadlockMap(): string | null {
  return null
}

export function getDeadlockHero(): string | null {
  return heroId != null ? `hero_${heroId}` : null
}

export function getDeadlockLobbyMatchId(): number | null {
  return activeMatchId
}

export function getDeadlockMatchStartedAt(): number | null {
  return matchStartedAtMs
}

export function getDeadlockMatchSalts(): DeadlockMatchSalts | null {
  return matchSalts
}

export function setDeadlockHeroId(id: number | null): void {
  heroId = id
}

function sessionSnapshot(): DeadlockLogSessionSnapshot {
  return {
    heroKey: getDeadlockHero(),
    mapName: null,
    phase,
    lobbyMatchId: activeMatchId,
    matchStartedAtMs,
    kills: [],
    deaths: [],
  }
}

export function buildDeadlockTimelineFromLogSession(
  recordingStartTime: number,
  matchStartTime: number | null,
): MatchData | null {
  return buildDeadlockLogTimeline(
    sessionSnapshot(),
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
  /** Steam httpcache path when available */
  steamCacheDir: string | null
  activeMatchId: number | null
  hasReplaySalt: boolean
  knownMatchCount: number
}

export function getDeadlockDetectionStatus(): DeadlockDetectionDiagnostics {
  const dirs = cachedReplayDirs.length ? cachedReplayDirs : getDeadlockReplayDirsSync()
  const replayDir = dirs.find((d) => fs.existsSync(d)) ?? dirs[0] ?? null

  return {
    phase,
    mapName: null,
    heroKey: getDeadlockHero(),
    logPath: null,
    logReceiving: isDeadlockLogReceiving(),
    logGrowing: lastActivityAt > 0 && Date.now() - lastActivityAt < 3_000,
    lastLogLine: matchSalts?.replaySalt != null
      ? `Replay on Valve CDN (match ${activeMatchId})`
      : activeMatchId != null
        ? `Match ${activeMatchId} — waiting on Steam cache`
        : '',
    replayLive: sawPartialLive || matchSalts?.replaySalt != null,
    condebugLikely: true,
    replayDir,
    readyToRecord: isDeadlockReadyToRecord(),
    matchLive: isDeadlockMatchLive(),
    liveKills: 0,
    liveDeaths: 0,
    lobbyMatchId: activeMatchId,
    logCandidates: [],
    steamCacheDir: null,
    activeMatchId,
    hasReplaySalt: matchSalts?.replaySalt != null,
    knownMatchCount: knownMatchIds.size,
  }
}
