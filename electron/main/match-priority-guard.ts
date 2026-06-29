/**
 * Pauses heavy background work (VOD compression, S3 upload) while OBS is
 * actively recording — that's what contends with NVENC and gameplay FPS.
 */

import type { ChildProcess } from 'child_process'
import log from 'electron-log'

export interface MatchPriorityDeps {
  isRecording: () => boolean
}

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
      opts?.logActivity?.('Recording in progress — upload will resume when the match ends')
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

export function pauseHeavyBackgroundWork(
  deps: MatchPriorityDeps,
  abortUpload: () => void,
  onUploadInterrupted?: (recordingIds: Iterable<string>) => void,
  activeUploadIds?: ReadonlySet<string>,
): void {
  if (!shouldDeferHeavyBackgroundWork(deps)) return
  abortUpload()
  abortVodCompression()
  if (activeUploadIds && onUploadInterrupted) {
    onUploadInterrupted(activeUploadIds)
  }
  log.info('[MatchPriority] Paused uploads/compression — OBS recording active')
}
