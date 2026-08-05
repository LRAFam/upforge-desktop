/**
 * OBS marks a sentinel on startup and removes it on a clean exit. If it is still
 * there on the next launch, OBS 32+ blocks with a Safe Mode prompt that loads
 * before obs-websocket, so UpForge can never connect. OBS 32 removed the
 * --disable-shutdown-check flag, so clearing the sentinel is the only way to
 * keep automated launches headless.
 */

import fs from 'fs'
import path from 'path'
import log from 'electron-log'

const SENTINEL_NAME = '.sentinel'

export function obsCrashSentinelPath(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string | null {
  if (platform === 'win32') {
    return env.APPDATA ? path.join(env.APPDATA, 'obs-studio', SENTINEL_NAME) : null
  }
  if (!env.HOME) return null
  if (platform === 'darwin') {
    return path.join(env.HOME, 'Library', 'Application Support', 'obs-studio', SENTINEL_NAME)
  }
  return path.join(env.HOME, '.config', 'obs-studio', SENTINEL_NAME)
}

/** Returns true when a sentinel existed and was removed. */
export function clearObsCrashSentinel(sentinelPath: string | null = obsCrashSentinelPath()): boolean {
  if (!sentinelPath) return false
  try {
    if (!fs.existsSync(sentinelPath)) return false
    // Older OBS writes a file here, 32.0.4+ writes a directory.
    fs.rmSync(sentinelPath, { recursive: true, force: true })
    log.info('[OBS Sentinel] Cleared crash sentinel before launch:', sentinelPath)
    return true
  } catch (err) {
    log.warn('[OBS Sentinel] Could not clear crash sentinel:', err instanceof Error ? err.message : String(err))
    return false
  }
}
