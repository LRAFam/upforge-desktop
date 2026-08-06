/**
 * Pauses heavy background work (VOD compression, S3 upload) while OBS is
 * actively recording — that's what contends with NVENC and gameplay FPS.
 *
 * The wait/defer gate is deliberately tied to *actual recording* (or an explicit
 * matchCapturePriority hold from the caller). It must NOT defer merely because a
 * game process is open (menu/lobby).
 */

import type { ChildProcess } from 'child_process'
import log from 'electron-log'
import { POST_MATCH_COPY } from '../../src/lib/post-match-copy'

export interface MatchPriorityDeps {
  /** True while OBS is recording, or while match-capture hold is active. */
  isRecording: () => boolean
}

export type HeavyWorkAbortReason = 'game_start' | 'match_capture' | 'performance_pause'

let activeVodCompressionProc: ChildProcess | null = null
const deferredRetries = new Map<string, () => Promise<void>>()

export function registerVodCompressionProc(proc: ChildProcess | null): void {
  activeVodCompressionProc = proc
}

export function abortVodCompression(): boolean {
  if (!activeVodCompressionProc) return false
  try {
    activeVodCompressionProc.kill('SIGKILL')
  } catch { /* ignore */ }
  activeVodCompressionProc = null
  log.info('[MatchPriority] Aborted in-flight VOD compression')
  return true
}

export function shouldDeferHeavyBackgroundWork(deps: MatchPriorityDeps): boolean {
  return deps.isRecording()
}

export async function waitUntilBackgroundWorkAllowed(
  deps: MatchPriorityDeps,
  opts?: { logActivity?: (msg: string) => void; intervalMs?: number; skipDefer?: boolean },
): Promise<void> {
  if (opts?.skipDefer) return

  const intervalMs = opts?.intervalMs ?? 2000
  let loggedWait = false
  while (shouldDeferHeavyBackgroundWork(deps)) {
    if (!loggedWait) {
      loggedWait = true
      opts?.logActivity?.(POST_MATCH_COPY.pausedUntilGameEnds)
      log.info('[MatchPriority] Deferring heavy background work until recording ends')
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
}

export function registerDeferredUploadRetry(recordingId: string, run: () => Promise<void>): void {
  deferredRetries.set(recordingId, run)
}

export function clearDeferredUploadRetry(recordingId: string): void {
  deferredRetries.delete(recordingId)
}

export async function flushDeferredUploadRetries(): Promise<void> {
  if (deferredRetries.size === 0) return
  const pending = [...deferredRetries.entries()]
  deferredRetries.clear()
  for (const [recordingId, run] of pending) {
    try {
      log.info('[MatchPriority] Resuming deferred upload for', recordingId)
      await run()
    } catch (err) {
      log.warn('[MatchPriority] Deferred upload failed for', recordingId, err)
    }
  }
}

/**
 * Always abort in-flight upload/compression. Used on game start and match capture
 * (before OBS is recording). Callers that need the post-match worker held must set
 * their own hold flag — this only kills work in flight.
 */
export function abortHeavyBackgroundWork(deps: {
  reason: HeavyWorkAbortReason
  abortUploads: () => void
  abortVodCompression?: () => boolean
  activeUploadIds?: ReadonlySet<string>
  onUploadInterrupted?: (recordingIds: Iterable<string>) => void
}): { interruptedCount: number } {
  deps.abortUploads()
  deps.abortVodCompression?.()
  const ids = deps.activeUploadIds ? [...deps.activeUploadIds] : []
  if (ids.length && deps.onUploadInterrupted) {
    deps.onUploadInterrupted(ids)
  }
  log.info(`[MatchPriority] Aborted uploads/compression (${deps.reason})`)
  return { interruptedCount: ids.length }
}

/** @deprecated Prefer abortHeavyBackgroundWork({ reason: 'game_start', ... }) */
export function abortHeavyBackgroundWorkOnGameStart(deps: {
  abortUploads: () => void
  abortVodCompression?: () => boolean
}): void {
  abortHeavyBackgroundWork({ reason: 'game_start', ...deps })
}

/** @deprecated Prefer abortHeavyBackgroundWork({ reason: 'match_capture', ... }) */
export function abortHeavyBackgroundWorkForMatchCapture(deps: {
  abortUploads: () => void
  abortVodCompression?: () => boolean
  activeUploadIds?: ReadonlySet<string>
  onUploadInterrupted?: (recordingIds: Iterable<string>) => void
}): { interruptedCount: number } {
  return abortHeavyBackgroundWork({ reason: 'match_capture', ...deps })
}

/**
 * Abort only while the defer gate is true (recording / match hold).
 * Prefer abortHeavyBackgroundWork at match detect — this path is a no-op before OBS starts.
 */
export function pauseHeavyBackgroundWork(
  deps: MatchPriorityDeps,
  abortUpload: () => void,
  onUploadInterrupted?: (recordingIds: Iterable<string>) => void,
  activeUploadIds?: ReadonlySet<string>,
): void {
  if (!shouldDeferHeavyBackgroundWork(deps)) return
  abortHeavyBackgroundWork({
    reason: 'performance_pause',
    abortUploads: abortUpload,
    abortVodCompression,
    activeUploadIds,
    onUploadInterrupted,
  })
  log.info('[MatchPriority] Paused uploads/compression — match performance mode active')
}
