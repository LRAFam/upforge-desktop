/**
 * Select high-value duel/death windows for moment-based vision coaching.
 * Manifest includes duel windows; desktop may attach clip_s3_key after local extract.
 */
import type { KillEvent, MatchData } from './riot-types'

export interface DuelMomentManifest {
  moment_id: string
  round: number
  video_offset_ms: number
  window_start_ms: number
  window_end_ms: number
  callout: string | null
  isolated: boolean
  trigger: 'player_death'
  weight: number
  /** S3 key when desktop pre-uploads the duel window MP4. */
  clip_s3_key?: string
}

export const DUEL_WINDOW_BEFORE_MS = 8000
export const DUEL_WINDOW_AFTER_MS = 2000
export const MAX_DUEL_MOMENTS = 8
const MIN_MOMENT_GAP_MS = 4000

function deathWeight(death: KillEvent): number {
  let weight = 30
  if (death.spatial?.isolated) weight += 35
  if (death.spatial?.callout && death.spatial.callout !== 'Unknown') weight += 10
  const allies = death.spatial?.alliesNearby ?? 0
  if (allies === 0) weight += 10
  return weight
}

function roundDisplay(death: KillEvent): number {
  const r = death.round
  if (typeof r === 'number' && r >= 0) return r + 1
  return 0
}

/**
 * Pick up to `limit` death moments ranked by coaching value (untraded > repeat callouts).
 */
export function pickDuelMoments(
  timeline: MatchData | null,
  limit = MAX_DUEL_MOMENTS,
): DuelMomentManifest[] {
  if (!timeline?.playerDeaths?.length) return []

  const calloutCounts = new Map<string, number>()
  for (const d of timeline.playerDeaths) {
    const c = d.spatial?.callout
    if (c && c !== 'Unknown') {
      calloutCounts.set(c, (calloutCounts.get(c) ?? 0) + 1)
    }
  }

  const scored = timeline.playerDeaths
    .filter((d) => d.videoOffsetMs != null && d.videoOffsetMs >= 0)
    .map((death) => {
      const callout = death.spatial?.callout ?? null
      let weight = deathWeight(death)
      if (callout && (calloutCounts.get(callout) ?? 0) >= 2) weight += 15
      return { death, weight }
    })
    .sort((a, b) => b.weight - a.weight)

  const picked: DuelMomentManifest[] = []
  const usedOffsets: number[] = []

  for (const { death, weight } of scored) {
    if (picked.length >= limit) break
    const offset = death.videoOffsetMs!
    if (usedOffsets.some((t) => Math.abs(t - offset) < MIN_MOMENT_GAP_MS)) continue

    const windowStart = Math.max(0, offset - DUEL_WINDOW_BEFORE_MS)
    const windowEnd = offset + DUEL_WINDOW_AFTER_MS

    picked.push({
      moment_id: `death-r${roundDisplay(death)}-${offset}`,
      round: roundDisplay(death),
      video_offset_ms: offset,
      window_start_ms: windowStart,
      window_end_ms: windowEnd,
      callout: death.spatial?.callout ?? null,
      isolated: death.spatial?.isolated ?? false,
      trigger: 'player_death',
      weight,
    })
    usedOffsets.push(offset)
  }

  return picked.sort((a, b) => a.video_offset_ms - b.video_offset_ms)
}

export function duelMomentsForUpload(timeline: MatchData | null): DuelMomentManifest[] {
  if (!timeline || timeline.game !== 'valorant') return []
  return pickDuelMoments(timeline)
}
