import type { BrowserWindow } from 'electron'
import log from 'electron-log'
import { buildTimelineFromDemo } from './demo-timeline'
import { findLatestReplay, type SourceGame } from './source-replay-finder'
import { SourceReplayUploader } from './source-replay-uploader'
import type { AuthManager } from './auth-manager'
import type { MatchData } from './riot-types'

export interface ReplayUploadMeta {
  matchId?: number | null
  matchStartedAt?: number | null
  heroId?: number | null
}

export interface PostMatchReplayContext {
  game: SourceGame
  matchSessionStart: number
  matchStartTime: number | null
  recordingStartTime: number
  gsiMap: string | null
  customReplayDir?: string
  localPlayerName?: string | null
}

function sendToWindow(win: BrowserWindow, channel: string, payload?: unknown): void {
  const deliver = () => {
    try {
      if (!win.isDestroyed()) win.webContents.send(channel, payload)
    } catch { /* destroyed */ }
  }
  if (win.isDestroyed()) return
  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', deliver)
  } else {
    deliver()
  }
}

/** Find replay on disk and parse into MatchData for clips and VOD review. */
export async function buildTimelineFromReplay(
  ctx: PostMatchReplayContext,
  options?: import('./source-replay-finder').FindLatestReplayOptions,
): Promise<{ timeline: MatchData | null; demoPath: string | null }> {
  const demoResult = await findLatestReplay(
    ctx.game,
    ctx.matchSessionStart,
    ctx.customReplayDir,
    options,
  )

  if (!demoResult.found || !demoResult.demoPath) {
    log.info(`[Replay] No ${ctx.game} replay found`)
    return { timeline: null, demoPath: null }
  }

  const timeline = await buildTimelineFromDemo({
    game: ctx.game,
    demoPath: demoResult.demoPath,
    map: ctx.gsiMap,
    matchStartTime: ctx.matchStartTime,
    recordingStartTime: ctx.recordingStartTime,
    localPlayerName: ctx.localPlayerName,
  })

  return { timeline, demoPath: demoResult.demoPath }
}

/** Upload replay for cloud analysis (non-blocking). */
export async function uploadReplayInBackground(
  game: SourceGame,
  demoPath: string,
  auth: AuthManager,
  notifyWindow: BrowserWindow | null,
  meta?: ReplayUploadMeta,
): Promise<{ jobId?: string; status: string }> {
  const send = (channel: string, payload?: unknown) => {
    if (notifyWindow && !notifyWindow.isDestroyed()) {
      sendToWindow(notifyWindow, channel, payload)
    }
  }

  try {
    log.info(`[Replay] ${game} replay found: ${demoPath} — uploading`)
    send('post-game:demo-status', { status: 'uploading', path: demoPath })

    const uploader = new SourceReplayUploader(auth)
    const user = auth.getUser()
    const steamId = user?.deadlock_account_id != null
      ? String(BigInt(user.deadlock_account_id) + BigInt('76561197960265728'))
      : null
    const { jobId } = await uploader.upload({
      game,
      demoPath,
      steamId: game === 'deadlock' ? steamId : null,
      matchId: meta?.matchId ?? null,
      matchStartedAt: meta?.matchStartedAt ?? null,
      heroId: meta?.heroId ?? null,
      onProgress: (pct) => send('post-game:demo-progress', pct),
    })

    send('post-game:demo-status', { status: 'analysing', jobId })

    const MAX_POLL_MS = 10 * 60 * 1000
    const pollStart = Date.now()
    let interval = 10_000

    while (Date.now() - pollStart < MAX_POLL_MS) {
      await new Promise<void>((r) => setTimeout(r, interval))
      interval = Math.min(interval * 1.5, 30_000)

      try {
        const { status, error } = await uploader.pollStatus(game, jobId)
        if (status === 'completed') {
          send('post-game:demo-status', { status: 'complete', jobId })
          return { jobId, status: 'completed' }
        }
        if (status === 'failed') {
          send('post-game:demo-status', { status: 'error', error: error ?? 'Analysis failed' })
          return { jobId, status: 'failed' }
        }
      } catch (pollErr) {
        log.warn(`[Replay] ${game} poll error (non-fatal):`, pollErr)
      }
    }

    log.warn(`[Replay] ${game} poll timed out — jobId=${jobId}`)
    return { jobId, status: 'timeout' }
  } catch (err) {
    log.warn(`[Replay] ${game} upload flow error:`, err)
    send('post-game:demo-status', { status: 'error', error: 'Replay upload failed' })
    return { status: 'error' }
  }
}

/** Upload a replay when VOD recording failed or was skipped — demo-only coaching path. */
export async function tryAutoUploadSourceReplay(opts: {
  game: SourceGame
  demoPath: string | null
  matchSessionStart: number
  auth: AuthManager
  notifyWindow: BrowserWindow | null
  customReplayDir?: string
  meta?: ReplayUploadMeta
}): Promise<void> {
  let demoPath = opts.demoPath
  if (!demoPath) {
    const found = await findLatestReplay(opts.game, opts.matchSessionStart, opts.customReplayDir)
    demoPath = found.demoPath
  }
  if (!demoPath) return
  const meta = opts.meta ?? (opts.game === 'deadlock'
    ? { matchStartedAt: Math.floor(opts.matchSessionStart / 1000) }
    : undefined)
  await uploadReplayInBackground(opts.game, demoPath, opts.auth, opts.notifyWindow, meta)
}
