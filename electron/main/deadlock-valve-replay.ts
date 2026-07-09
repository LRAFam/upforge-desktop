/**
 * Download Deadlock replays from Valve CDN using match salts from Steam httpcache.
 */

import fs from 'fs'
import path from 'path'
import { createWriteStream } from 'fs'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import b2 from 'unbzip2-stream'
import log from 'electron-log'
import { buildDeadlockReplayUrl, type DeadlockMatchSalts } from './deadlock-steam-cache'
import { resolveDeadlockReplayDirs } from './deadlock-paths'

export type DeadlockValveReplayResult =
  | { ok: true; demoPath: string; salts: DeadlockMatchSalts }
  | { ok: false; error: string; code?: string }

async function downloadBz2Demo(url: string, destPath: string): Promise<void> {
  const res = await fetch(url, { redirect: 'follow' })
  if (res.status === 404) {
    throw new Error('Valve replay not on CDN yet — try again in a few minutes.')
  }
  if (!res.ok || !res.body) {
    throw new Error(`Replay download failed (${res.status}).`)
  }

  const tmpPath = `${destPath}.part`
  const out = createWriteStream(tmpPath)
  const nodeStream = Readable.fromWeb(res.body as import('stream/web').ReadableStream)
  await pipeline(nodeStream, b2(), out)
  fs.renameSync(tmpPath, destPath)
}

export async function downloadDeadlockValveReplay(
  salts: DeadlockMatchSalts,
  customDir?: string,
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
    await downloadBz2Demo(url, demoPath)
    return { ok: true, demoPath, salts }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log.warn('[DeadlockValve] Download failed:', message)
    try { fs.unlinkSync(`${demoPath}.part`) } catch { /* ignore */ }
    try { fs.unlinkSync(demoPath) } catch { /* ignore */ }
    return { ok: false, error: message, code: 'download_failed' }
  }
}
