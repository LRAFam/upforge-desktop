/**
 * Read Deadlock match salts from Steam's local HTTP cache (same approach as deadlock-api-ingest).
 * No -condebug, no console.log — the game client writes replay CDN URLs here when it talks to Valve.
 */

import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import log from 'electron-log'
import { DEADLOCK_STEAM_APP_ID } from './deadlock-paths'

const execAsync = promisify(exec)
const IS_WIN = process.platform === 'win32'

const VALVE_HOST_MARKER = '.valve.net'
const MAX_BYTES_TO_READ = 512
const CACHE_DIR_TTL_MS = 5 * 60 * 1000
let cachedHttpCacheDir: string | null | undefined
let cacheDirResolvedAt = 0
let cacheDirResolution: Promise<string | null> | null = null

export interface DeadlockMatchSalts {
  matchId: number
  clusterId: number
  metadataSalt: number | null
  replaySalt: number | null
}

export interface DeadlockCacheScanHit extends DeadlockMatchSalts {
  sourcePath: string
  url: string
}

async function getSteamPath(): Promise<string | null> {
  if (!IS_WIN) return null
  for (const key of [
    'HKCU\\Software\\Valve\\Steam',
    'HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam',
    'HKLM\\SOFTWARE\\Valve\\Steam',
  ]) {
    for (const valueName of ['SteamPath', 'InstallPath']) {
      try {
        const { stdout } = await execAsync(
          `reg query "${key}" /v ${valueName}`,
          { windowsHide: true, timeout: 5000 },
        )
        const match = new RegExp(`${valueName}\\s+REG_SZ\\s+(.+)`, 'i').exec(stdout)
        if (match?.[1]?.trim()) return match[1].trim()
      } catch { /* try next */ }
    }
  }
  return null
}

/** Steam/appcache/httpcache — where Deadlock replay CDN URLs are cached. */
export async function resolveSteamHttpCacheDir(): Promise<string | null> {
  if (
    cachedHttpCacheDir !== undefined
    && Date.now() - cacheDirResolvedAt < CACHE_DIR_TTL_MS
  ) {
    return cachedHttpCacheDir
  }
  if (cacheDirResolution) return cacheDirResolution

  cacheDirResolution = (async () => {
    const steamPath = await getSteamPath()
    const dir = steamPath ? path.join(steamPath, 'appcache', 'httpcache') : null
    cachedHttpCacheDir = dir && fs.existsSync(dir) ? dir : null
    cacheDirResolvedAt = Date.now()
    return cachedHttpCacheDir
  })().finally(() => {
    cacheDirResolution = null
  })
  return cacheDirResolution
}

/** Parse a Valve CDN replay URL into match salts. */
export function parseDeadlockValveUrl(url: string): DeadlockMatchSalts | null {
  const base = url.split('?')[0] ?? url
  const hostSplit = base.split('://replay')[1]
  if (!hostSplit) return null

  const [clusterPart, rest] = hostSplit.split('.valve.net/')
  if (!clusterPart || !rest) return null

  const clusterId = Number.parseInt(clusterPart, 10)
  if (!Number.isFinite(clusterId)) return null

  const appPrefix = `${DEADLOCK_STEAM_APP_ID}/`
  const appIdx = rest.indexOf(appPrefix)
  if (appIdx < 0) return null

  const name = rest.slice(appIdx + appPrefix.length)
  if (name.endsWith('.meta.bz2')) {
    const core = name.slice(0, -'.meta.bz2'.length)
    const us = core.lastIndexOf('_')
    if (us < 0) return null
    const matchId = Number.parseInt(core.slice(0, us), 10)
    const metadataSalt = Number.parseInt(core.slice(us + 1), 10)
    if (!Number.isFinite(matchId) || !Number.isFinite(metadataSalt)) return null
    return { matchId, clusterId, metadataSalt, replaySalt: null }
  }

  if (name.endsWith('.dem.bz2')) {
    const core = name.slice(0, -'.dem.bz2'.length)
    const us = core.lastIndexOf('_')
    if (us < 0) return null
    const matchId = Number.parseInt(core.slice(0, us), 10)
    const replaySalt = Number.parseInt(core.slice(us + 1), 10)
    if (!Number.isFinite(matchId) || !Number.isFinite(replaySalt)) return null
    return { matchId, clusterId, metadataSalt: null, replaySalt }
  }

  return null
}

function extractValveUrlsFromBuffer(data: Buffer): string[] {
  const urls: string[] = []
  const marker = Buffer.from(VALVE_HOST_MARKER)
  let offset = 0

  while (offset < data.length) {
    const idx = data.indexOf(marker, offset)
    if (idx < 0) break

    let hostStart = idx
    while (hostStart > 0) {
      const b = data[hostStart - 1]!
      if ((b >= 0x30 && b <= 0x39) || (b >= 0x61 && b <= 0x7a) || b === 0x2e) {
        hostStart--
        continue
      }
      break
    }

    const pathStart = data.indexOf(0x2f, idx + marker.length)
    if (pathStart < 0) {
      offset = idx + marker.length
      continue
    }

    let pathEnd = pathStart + 1
    while (pathEnd < data.length) {
      const b = data[pathEnd]!
      if (b === 0x00 || b === 0x0a || b === 0x0d || b === 0x22 || b === 0x27 || b === 0x20) break
      pathEnd++
    }

    const host = data.subarray(hostStart, idx + marker.length).toString('utf-8')
    const urlPath = data.subarray(pathStart, pathEnd).toString('utf-8')
    if (host.startsWith('replay') && urlPath.includes(DEADLOCK_STEAM_APP_ID)) {
      urls.push(`http://${host}${urlPath}`)
    }

    offset = idx + marker.length
  }

  return urls
}

/** Scan one Steam httpcache file for Deadlock replay URLs. */
export function scanHttpCacheFile(filePath: string): DeadlockCacheScanHit[] {
  let fd: number | null = null
  try {
    fd = fs.openSync(filePath, 'r')
    const size = fs.fstatSync(fd).size
    const readLen = Math.min(size, MAX_BYTES_TO_READ)
    if (readLen <= 0) return []

    const buf = Buffer.alloc(readLen)
    fs.readSync(fd, buf, 0, readLen, 0)

    const hits: DeadlockCacheScanHit[] = []
    for (const url of extractValveUrlsFromBuffer(buf)) {
      const salts = parseDeadlockValveUrl(url)
      if (!salts) continue
      hits.push({ ...salts, sourcePath: filePath, url })
    }
    return hits
  } catch {
    return []
  } finally {
    if (fd != null) {
      try { fs.closeSync(fd) } catch { /* ignore */ }
    }
  }
}

function walkCacheDir(dir: string, results: DeadlockCacheScanHit[], notBeforeMtimeMs: number): void {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkCacheDir(full, results, notBeforeMtimeMs)
      continue
    }
    if (!entry.isFile()) continue

    try {
      const stat = fs.statSync(full)
      if (stat.mtimeMs < notBeforeMtimeMs) continue
      results.push(...scanHttpCacheFile(full))
    } catch { /* skip */ }
  }
}

/** Scan httpcache for Deadlock URLs modified after `notBeforeMs`. */
export async function scanSteamHttpCache(notBeforeMs: number): Promise<DeadlockCacheScanHit[]> {
  const cacheDir = await resolveSteamHttpCacheDir()
  if (!cacheDir) return []

  const results: DeadlockCacheScanHit[] = []
  walkCacheDir(cacheDir, results, notBeforeMs)
  return results
}

export function mergeSalts(
  existing: DeadlockMatchSalts | null,
  incoming: DeadlockMatchSalts,
): DeadlockMatchSalts {
  if (!existing || existing.matchId !== incoming.matchId) return { ...incoming }
  return {
    matchId: incoming.matchId,
    clusterId: incoming.clusterId || existing.clusterId,
    metadataSalt: incoming.metadataSalt ?? existing.metadataSalt,
    replaySalt: incoming.replaySalt ?? existing.replaySalt,
  }
}

export function buildDeadlockReplayUrl(salts: DeadlockMatchSalts): string | null {
  if (salts.replaySalt == null) return null
  return `http://replay${salts.clusterId}.valve.net/${DEADLOCK_STEAM_APP_ID}/${salts.matchId}_${salts.replaySalt}.dem.bz2`
}

export async function logSteamCacheDiagnostics(): Promise<string | null> {
  const dir = await resolveSteamHttpCacheDir()
  if (!dir) {
    log.info('[DeadlockCache] Steam httpcache directory not found')
    return null
  }
  log.info('[DeadlockCache] Watching', dir)
  return dir
}
