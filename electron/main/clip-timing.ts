/** Shift absolute VOD offset after trimming seconds from the start of a clip file. */
export function adjustMomentOffsetAfterTrim(
  momentOffsetMs: number | null | undefined,
  trimStartSec: number,
): number | null {
  if (momentOffsetMs == null) return null
  return Math.max(0, momentOffsetMs - Math.round(trimStartSec * 1000))
}
