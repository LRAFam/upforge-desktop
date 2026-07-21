/**
 * Shift local clip timing after a VOD sync nudge so extract-time metadata stays aligned.
 */
import type { ClipRecord, ClipStore } from './clip-store'

export function shiftClipTimingByDelta(
  clip: ClipRecord,
  deltaMs: number,
): Partial<ClipRecord> {
  if (!deltaMs) return {}
  const patch: Partial<ClipRecord> = {}
  if (clip.momentOffsetMs != null) {
    patch.momentOffsetMs = Math.max(0, clip.momentOffsetMs + deltaMs)
  }
  if (clip.clipStartMs != null) {
    patch.clipStartMs = Math.max(0, clip.clipStartMs + deltaMs)
  }
  if (clip.clipEvents?.length) {
    patch.clipEvents = clip.clipEvents.map((ev) => ({
      ...ev,
      vod_offset_ms: Math.max(0, ev.vod_offset_ms + deltaMs),
      // clip_offset_ms is relative to the file — unchanged by a global VOD nudge
    }))
  }
  return patch
}

/** Apply a sync nudge to all local clips for a match (or analysis job). */
export function applySyncNudgeToMatchClips(
  clipStore: ClipStore,
  opts: { matchId?: string | null; analysisJobId?: string | null; deltaMs: number },
): number {
  const { matchId, analysisJobId, deltaMs } = opts
  if (!deltaMs || (!matchId && !analysisJobId)) return 0

  let updated = 0
  for (const clip of clipStore.getAll()) {
    const match =
      (matchId && clip.matchId === matchId)
      || (analysisJobId && clip.analysisJobId === analysisJobId)
    if (!match) continue
    if (clip.uploadStatus === 'uploaded' || clip.uploadStatus === 'uploading') continue
    const patch = shiftClipTimingByDelta(clip, deltaMs)
    if (Object.keys(patch).length === 0) continue
    clipStore.update(clip.id, patch)
    updated++
  }
  return updated
}
