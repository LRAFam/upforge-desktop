import fs from 'fs'
import log from 'electron-log'
import { findNewestDemoInDir } from './demo-finder'
import { getCandidateCS2CsgoDirs } from './cs2-demo-finder'
import { getDeadlockReplayDirsSync, resolveDeadlockReplayDirs } from './deadlock-paths'

export type SourceGame = 'cs2' | 'deadlock'

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

export async function findLatestReplay(
  game: SourceGame,
  matchStartTime: number,
  customDir?: string,
): Promise<{ found: boolean; demoPath: string | null; demoDir: string | null; error?: string }> {
  if (game === 'cs2') {
    const dirs = customDir?.trim()
      ? [customDir.trim()]
      : await getCandidateCS2CsgoDirs()
    if (!dirs.length) {
      return { found: false, demoPath: null, demoDir: null, error: 'CS2 demo directory not found' }
    }

    log.info(`[Replay] CS2 — polling ${dirs.length} demo dir(s)`)
    const deadline = Date.now() + 90_000
    while (Date.now() < deadline) {
      const found = findNewestDemoAcrossDirs(dirs, matchStartTime)
      if (found) {
        log.info(`[Replay] CS2 — found ${found.demoPath}`)
        return { found: true, demoPath: found.demoPath, demoDir: found.demoDir }
      }
      await sleep(2_000)
    }

    log.info(`[Replay] CS2 — no demo in ${dirs.join(', ')}`)
    return { found: false, demoPath: null, demoDir: dirs[0] ?? null }
  }

  const dirs = await resolveDeadlockReplayDirs(customDir)
  if (!dirs.length) {
    return { found: false, demoPath: null, demoDir: null, error: 'Deadlock replay directory not found' }
  }

  log.info(`[Replay] Deadlock — polling ${dirs.length} replay dirs`)

  // Deadlock can take a minute+ to finalize .dem files after match end.
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    const found = findNewestDemoAcrossDirs(dirs, matchStartTime)
    if (found) {
      log.info(`[Replay] Deadlock — found ${found.demoPath}`)
      return { found: true, demoPath: found.demoPath, demoDir: found.demoDir }
    }
    await sleep(2_000)
  }

  log.info(`[Replay] Deadlock — no replay in ${dirs.join(', ')}`)
  return { found: false, demoPath: null, demoDir: dirs[0] ?? null }
}
