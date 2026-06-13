import path from 'path'
import log from 'electron-log'
import { detectCS2DemoDir } from './cs2-demo-finder'
import { pollForLatestDemo } from './demo-finder'

export type SourceGame = 'cs2' | 'deadlock'

export function getReplayDirForGame(game: SourceGame, customDir?: string): string | null {
  if (customDir?.trim()) return customDir.trim()

  if (game === 'cs2') return null // resolved async via Steam

  const local = process.env.LOCALAPPDATA
  if (!local) return null
  return path.join(local, 'Deadlock', 'game', 'deadlock', 'replays')
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
    return pollForLatestDemo(dir, matchStartTime)
  }

  const dir = getReplayDirForGame('deadlock', customDir)
  if (!dir) {
    return { found: false, demoPath: null, demoDir: null, error: 'Deadlock replay directory not found' }
  }
  log.info(`[Replay] Deadlock — polling ${dir}`)
  return pollForLatestDemo(dir, matchStartTime)
}
