import fs from 'fs'
import log from 'electron-log'
import { findNewestDemoInDir } from './demo-finder'
import { detectCS2DemoDir } from './cs2-demo-finder'
import { pollForLatestDemo } from './demo-finder'
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

export async function findLatestReplay(
  game: SourceGame,
  matchStartTime: number,
  customDir?: string,
): Promise<{ found: boolean; demoPath: string | null; demoDir: string | null; error?: string }> {
  if (game === 'cs2') {
    const dir = customDir ?? (await detectCS2DemoDir())
    if (!dir) {
      return { found: false, demoPath: null, demoDir: null, error: 'CS2 demo directory not found' }
    }
    log.info(`[Replay] CS2 — polling ${dir}`)
    return pollForLatestDemo(dir, matchStartTime, 90_000)
  }

  const dirs = await resolveDeadlockReplayDirs(customDir)
  if (!dirs.length) {
    return { found: false, demoPath: null, demoDir: null, error: 'Deadlock replay directory not found' }
  }

  log.info(`[Replay] Deadlock — polling ${dirs.length} replay dirs`)

  // Deadlock can take a minute+ to finalize .dem files after match end.
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) continue
      const demo = findNewestDemoInDir(dir, matchStartTime)
      if (demo) {
        log.info(`[Replay] Deadlock — found ${demo}`)
        return { found: true, demoPath: demo, demoDir: dir }
      }
    }
    await new Promise((r) => setTimeout(r, 2_000))
  }

  log.info(`[Replay] Deadlock — no replay in ${dirs.join(', ')}`)
  return { found: false, demoPath: null, demoDir: dirs[0] ?? null }
}
