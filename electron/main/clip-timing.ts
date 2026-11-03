/** Shift absolute VOD offset after trimming seconds from the start of a clip file. */
export function adjustMomentOffsetAfterTrim(
  momentOffsetMs: number | null | undefined,
  trimStartSec: number,
): number | null {
  if (momentOffsetMs == null) return null
  return Math.max(0, momentOffsetMs - Math.round(trimStartSec * 1000))
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
