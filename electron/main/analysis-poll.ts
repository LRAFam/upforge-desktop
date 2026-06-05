import type { BrowserWindow } from 'electron'
import type { UploadManager } from './upload-manager'
import { clearPendingJob } from './upload-manager'

/** Keep polling while the server job is still queued/processing (matches long VOD runs). */
export const ANALYSIS_POLL_MAX_MS = 90 * 60 * 1000

/** After this, nudge the UI that the job is still running — not a failure. */
export const ANALYSIS_LONG_RUNNING_MS = 10 * 60 * 1000

export interface AnalysisPollStatus {
  status: string
  progress?: number
  current_step?: string | null
  result?: Record<string, unknown>
  error?: string | null
  job_id?: string
}

export interface AnalysisProgressPayload {
  jobId: string
  status: string
  progress: number
  current_step: string | null
  elapsed_ms: number
}

export interface StartAnalysisPollOptions {
  uploadManager: UploadManager
  jobId: string
  targetWindow?: BrowserWindow | null
  mainWindow?: BrowserWindow | null
  onProgress?: (status: AnalysisPollStatus, elapsedMs: number) => void
  onLongRunning?: () => void
  onCompleted: (status: AnalysisPollStatus) => void
  onFailed: (userMessage: string, rawError: string) => void
  onConnectionLost: () => void
  onPollEnded?: (reason: 'completed' | 'failed' | 'connection_lost' | 'max_duration') => void
}

export type AnalysisPollEndReason = 'completed' | 'failed' | 'connection_lost' | 'max_duration'

function sendToWindow(win: BrowserWindow | null | undefined, channel: string, payload?: unknown): void {
  if (!win || win.isDestroyed()) return
  try {
    win.webContents.send(channel, payload)
  } catch { /* window destroyed mid-send */ }
}

function normalizeProgress(status: AnalysisPollStatus): number {
  const raw = status.progress
  if (typeof raw !== 'number' || Number.isNaN(raw)) {
    if (status.status === 'queued') return 0
    if (status.status === 'processing') return 5
    return 0
  }
  return Math.min(100, Math.max(0, Math.round(raw)))
}

function buildProgressPayload(
  jobId: string,
  status: AnalysisPollStatus,
  elapsedMs: number
): AnalysisProgressPayload {
  return {
    jobId,
    status: status.status,
    progress: normalizeProgress(status),
    current_step: status.current_step ?? null,
    elapsed_ms: elapsedMs,
  }
}

/**
 * Poll desktop-submissions status until the job completes, fails, loses connectivity,
 * or hits the hard max duration. Does not treat elapsed time as a server failure.
 */
export function startAnalysisPoll(opts: StartAnalysisPollOptions): { stop: () => void } {
  const startTime = Date.now()
  let pollFailCount = 0
  let pollDelay = 5_000
  let pollTimer: ReturnType<typeof setTimeout> | null = null
  let longRunningSent = false
  let stopped = false

  const stop = () => {
    stopped = true
    if (pollTimer) {
      clearTimeout(pollTimer)
      pollTimer = null
    }
  }

  const schedulePoll = () => {
    if (stopped) return
    pollTimer = setTimeout(pollOnce, pollDelay)
    pollDelay = Math.min(Math.round(pollDelay * 1.5), 30_000)
  }

  const pollOnce = async () => {
    if (stopped) return
    const elapsedMs = Date.now() - startTime

    if (elapsedMs > ANALYSIS_POLL_MAX_MS) {
      stop()
      opts.onPollEnded?.('max_duration')
      return
    }

    if (!longRunningSent && elapsedMs >= ANALYSIS_LONG_RUNNING_MS) {
      longRunningSent = true
      opts.onLongRunning?.()
      sendToWindow(opts.targetWindow, 'post-game:analysis-long-running')
      sendToWindow(opts.mainWindow, 'post-game:analysis-long-running')
    }

    try {
      const status = await opts.uploadManager.pollStatus(opts.jobId)
      pollFailCount = 0

      const progressPayload = buildProgressPayload(opts.jobId, status, elapsedMs)
      sendToWindow(opts.targetWindow, 'post-game:analysis-progress', progressPayload)
      sendToWindow(opts.mainWindow, 'dashboard:analysis-progress', progressPayload)
      opts.onProgress?.(status, elapsedMs)

      if (status.status === 'completed' && status.result) {
        stop()
        clearPendingJob()
        opts.onPollEnded?.('completed')
        opts.onCompleted(status)
      } else if (status.status === 'failed') {
        stop()
        clearPendingJob()
        const rawError = status.error || 'Analysis failed. Please try again.'
        const isTimeout = /timed? ?out|curl error 28|operation timed/i.test(rawError)
        const userMessage = isTimeout ? 'Analysis timed out on the server.' : rawError
        opts.onPollEnded?.('failed')
        opts.onFailed(userMessage, rawError)
      } else {
        schedulePoll()
      }
    } catch (pollErr) {
      pollFailCount++
      console.warn(`[AnalysisPoll] Poll error (${pollFailCount}):`, pollErr)
      if (pollFailCount >= 5) {
        stop()
        opts.onPollEnded?.('connection_lost')
        opts.onConnectionLost()
      } else {
        schedulePoll()
      }
    }
  }

  schedulePoll()
  return { stop }
}
