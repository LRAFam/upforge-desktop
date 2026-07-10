/**
 * Download Deadlock replays from Valve CDN using match salts from Steam httpcache.
 */

import fs from 'fs'
import path from 'path'
import log from 'electron-log'
import { buildDeadlockReplayUrl, type DeadlockMatchSalts } from './deadlock-steam-cache'
import { resolveDeadlockReplayDirs } from './deadlock-paths'
import {
  downloadValveDemoArchive,
  type ValveDemoDownloadProgressHandler,
} from './valve-demo-download'

export type DeadlockValveReplayResult =
  | { ok: true; demoPath: string; salts: DeadlockMatchSalts }
  | { ok: false; error: string; code?: string }

export async function downloadDeadlockValveReplay(
  salts: DeadlockMatchSalts,
  customDir?: string,
  onProgress?: ValveDemoDownloadProgressHandler,
): Promise<DeadlockValveReplayResult> {
  const url = buildDeadlockReplayUrl(salts)
  if (!url) {
    return { ok: false, error: 'Replay salt not available yet — keep Steam open after the match.', code: 'no_salt' }
  }

  const dirs = await resolveDeadlockReplayDirs(customDir)
  const downloadDir = dirs[0]
  if (!downloadDir) {
    return { ok: false, error: 'Deadlock replay folder not found.', code: 'no_dir' }
  }
  fs.mkdirSync(downloadDir, { recursive: true })

  const demoPath = path.join(downloadDir, `deadlock_${salts.matchId}.dem`)
  if (fs.existsSync(demoPath)) {
    return { ok: true, demoPath, salts }
  }

  try {
    log.info('[DeadlockValve] Downloading', url, '→', demoPath)
    await downloadValveDemoArchive(url, demoPath, onProgress)
    return { ok: true, demoPath, salts }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log.warn('[DeadlockValve] Download failed:', message)
    try { fs.unlinkSync(`${demoPath}.part`) } catch { /* ignore */ }
    try { fs.unlinkSync(demoPath) } catch { /* ignore */ }
    return { ok: false, error: message, code: 'download_failed' }
  }
}
