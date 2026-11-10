import fs from 'fs'
import type { ClipRecord } from './clip-store'

/**
 * Timing fields after keeping [startSec, endSec] of a clip file. `momentOffsetMs` is an absolute
 * VOD offset (unchanged); the clip file now begins `startSec` later in the match, and per-clip
 * event offsets move back by the same amount (events cut off by the trim are dropped).
 */
export function clipTimingAfterTrim(
  clip: Pick<ClipRecord, 'momentOffsetMs' | 'clipStartMs' | 'clipEvents'>,
  startSec: number,
  endSec: number,
): Pick<ClipRecord, 'momentOffsetMs' | 'clipStartMs' | 'clipEvents'> {
  const trimMs = Math.round(startSec * 1000)
  const durationMs = Math.round((endSec - startSec) * 1000)
  return {
    momentOffsetMs: clip.momentOffsetMs ?? null,
    clipStartMs: clip.clipStartMs == null ? null : clip.clipStartMs + trimMs,
    clipEvents: clip.clipEvents == null
      ? null
      : clip.clipEvents
        .map(e => ({ ...e, clip_offset_ms: e.clip_offset_ms - trimMs }))
        .filter(e => e.clip_offset_ms >= 0 && e.clip_offset_ms <= durationMs),
  }
}

/**
 * Put `replacementPath` at `targetPath`. On any failure the original stays at `targetPath`
 * (or, if even the restore fails, at `targetPath.bak`) — it is never deleted.
 */
export function replaceClipFileKeepingOriginal(targetPath: string, replacementPath: string): void {
  const backupPath = targetPath + '.bak'
  fs.renameSync(targetPath, backupPath)
  try {
    fs.renameSync(replacementPath, targetPath)
  } catch (err) {
    try {
      fs.renameSync(backupPath, targetPath)
    } catch (restoreErr) {
      throw new Error(`Trim failed and the original clip is kept at ${backupPath}: ${restoreErr instanceof Error ? restoreErr.message : String(restoreErr)}`, { cause: err })
    }
    throw err
  }
  try { fs.unlinkSync(backupPath) } catch { /* backup cleanup — non-fatal */ }
}

/** Longest multi-kill / ace clip, unless the kills themselves span longer. */
export const COMBINED_CLIP_MAX_MS = 120_000

/**
 * Clip window for a multi-kill or ace: from `preMs` before the first kill to `postMs` after the
 * last. The length cap never cuts off a kill — a spread-out ace keeps its last kill plus 3 s.
 */
export function combinedKillClipWindow(
  killOffsetsMs: number[],
  trigger: 'ace' | 'multikill',
): { startMs: number; durationMs: number } | null {
  if (killOffsetsMs.length === 0) return null
  const first = Math.min(...killOffsetsMs)
  const last = Math.max(...killOffsetsMs)
  const preMs = trigger === 'ace' ? 10_000 : 8_000
  const postMs = trigger === 'ace' ? 20_000 : 18_000
  const startMs = Math.max(0, first - preMs)
  const durationMs = Math.min(last - startMs + postMs, Math.max(COMBINED_CLIP_MAX_MS, last - startMs + 3_000))
  return { startMs, durationMs }
}
