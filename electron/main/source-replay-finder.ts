import fs from 'fs'
import log from 'electron-log'
import { findNewestDemoInDir } from './demo-finder'
import { getCandidateCS2CsgoDirs } from './cs2-demo-finder'
import { CS2_DEMO_POST_MATCH_QUICK_POLL_MS } from './match-data-quality'
import { getDeadlockReplayDirsSync, resolveDeadlockReplayDirs } from './deadlock-paths'

export type SourceGame = 'cs2' | 'deadlock'

export interface FindLatestReplayOptions {
  /** Max time to poll before giving up (ms). */
  maxWaitMs?: number
  /** Single directory scan — for background refresh ticks. */
  pollOnce?: boolean
}

/** @deprecated Prefer resolveDeadlockReplayDirs — kept for sync hot paths. */
export function getDeadlockReplayDirs(customDir?: string): string[] {
  return getDeadlockReplayDirsSync(customDir)
}

export function getReplayDirForGame(game: SourceGame, customDir?: string): string | null {
  if (customDir?.trim()) return customDir.trim()

  if (game === 'cs2') return null // resolved async via Steam

  const dirs = getDeadlockReplayDirsSync()
  return dirs[0] ?? null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function findNewestDemoAcrossDirs(
  dirs: string[],
  matchStartTime: number,
): { demoPath: string; demoDir: string } | null {
  let newest: { path: string; mtimeMs: number; dir: string } | null = null

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue
    const demoPath = findNewestDemoInDir(dir, matchStartTime)
    if (!demoPath) continue
    try {
      const mtimeMs = fs.statSync(demoPath).mtimeMs
      if (!newest || mtimeMs > newest.mtimeMs) {
        newest = { path: demoPath, mtimeMs, dir }
      }
    } catch {
      // skip unreadable
    }
  }

  return newest ? { demoPath: newest.path, demoDir: newest.dir } : null
}

async function pollReplayDirs(
  game: SourceGame,
  dirs: string[],
  matchStartTime: number,
  options?: FindLatestReplayOptions,
): Promise<{ found: boolean; demoPath: string | null; demoDir: string | null }> {
  const maxWaitMs = options?.maxWaitMs ?? (game === 'cs2' ? CS2_DEMO_POST_MATCH_QUICK_POLL_MS : 90_000)
  const pollOnce = options?.pollOnce === true
  const deadline = pollOnce ? Date.now() : Date.now() + maxWaitMs

  do {
    const found = findNewestDemoAcrossDirs(dirs, matchStartTime)
    if (found) {
      log.info(`[Replay] ${game} — found ${found.demoPath}`)
      return { found: true, demoPath: found.demoPath, demoDir: found.demoDir }
    }
    if (pollOnce || Date.now() >= deadline) break
    await sleep(2_000)
  } while (Date.now() < deadline)

  return { found: false, demoPath: null, demoDir: dirs[0] ?? null }
}

export async function findLatestReplay(
  game: SourceGame,
  matchStartTime: number,
  customDir?: string,
  options?: FindLatestReplayOptions,
): Promise<{ found: boolean; demoPath: string | null; demoDir: string | null; error?: string }> {
  if (game === 'cs2') {
    const dirs = customDir?.trim()
      ? [customDir.trim()]
      : await getCandidateCS2CsgoDirs()
    if (!dirs.length) {
      return { found: false, demoPath: null, demoDir: null, error: 'CS2 demo directory not found' }
    }

    log.info(`[Replay] CS2 — scanning ${dirs.length} demo dir(s)${options?.pollOnce ? ' (once)' : ''}`)
    const result = await pollReplayDirs(game, dirs, matchStartTime, options)
    if (!result.found) {
      log.info(`[Replay] CS2 — no demo in ${dirs.join(', ')}`)
    }
    return { ...result }
  }

  const dirs = await resolveDeadlockReplayDirs(customDir)
  if (!dirs.length) {
    return { found: false, demoPath: null, demoDir: null, error: 'Deadlock replay directory not found' }
  }

  log.info(`[Replay] Deadlock — polling ${dirs.length} replay dirs`)
  const result = await pollReplayDirs(game, dirs, matchStartTime, options)
  if (!result.found) {
    log.info(`[Replay] Deadlock — no replay in ${dirs.join(', ')}`)
  }
  return result
}
