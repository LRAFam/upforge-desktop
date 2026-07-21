/**
 * Live kill stamps: wall-clock position in the recording when a kill was detected.
 * Prefer these over post-match MatchDetails heuristics for clip/VOD seeks.
 */
import type { KillEvent, MatchData } from './riot-types'

export interface LiveKillStamp {
  /** Live Client EventTime (seconds on game clock). */
  eventTimeSec: number
  /** ms from OBS recording start when the kill was observed. */
  recordingOffsetMs: number
  victimName?: string
  stampedAt: number
}

/** Match a MatchDetails kill to the nearest live stamp within this window. */
export const LIVE_STAMP_MATCH_SEC = 4

/**
 * Overwrite kill videoOffsetMs with live recording stamps when EventTime aligns.
 * Returns how many kills were updated.
 */
export function applyLiveKillStampsToTimeline(
  timeline: MatchData,
  stamps: LiveKillStamp[],
): number {
  if (!stamps.length) return 0

  const unused = [...stamps]
  let applied = 0

  const patch = (ev: KillEvent) => {
    const gameSec =
      ev.timeSinceGameStartMillis != null && !Number.isNaN(ev.timeSinceGameStartMillis)
        ? ev.timeSinceGameStartMillis / 1000
        : ev.EventTime
    if (gameSec == null || Number.isNaN(gameSec)) return

    let bestIdx = -1
    let bestDelta = Infinity
    for (let i = 0; i < unused.length; i++) {
      const delta = Math.abs(unused[i]!.eventTimeSec - gameSec)
      if (delta < bestDelta) {
        bestDelta = delta
        bestIdx = i
      }
    }
    if (bestIdx < 0 || bestDelta > LIVE_STAMP_MATCH_SEC) return

    const [stamp] = unused.splice(bestIdx, 1)
    if (!stamp) return
    ev.videoOffsetMs = Math.max(0, stamp.recordingOffsetMs)
    applied++
  }

  for (const k of timeline.killEvents ?? []) patch(k)
  for (const k of timeline.playerKills ?? []) patch(k)
  for (const k of timeline.playerDeaths ?? []) patch(k)

  return applied
}

export interface ClipTimelineEvent {
  event_type: 'kill'
  /** Offset inside the exported clip file (ms). */
  clip_offset_ms: number
  /** Absolute offset in the source VOD (ms). */
  vod_offset_ms: number
  victim_agent?: string | null
  weapon?: string | null
  round?: number | null
}

/** Build clip-relative events from VOD kill offsets and the ffmpeg cut start. */
export function buildClipEventsFromKills(
  kills: Array<{
    videoOffsetMs: number
    victimAgent?: string | null
    weapon?: string | null
    round?: number | null
  }>,
  clipStartMs: number,
  clipDurationMs: number,
): ClipTimelineEvent[] {
  const events: ClipTimelineEvent[] = []
  for (const k of kills) {
    const clipOffset = k.videoOffsetMs - clipStartMs
    if (clipOffset < -500 || clipOffset > clipDurationMs + 500) continue
    events.push({
      event_type: 'kill',
      clip_offset_ms: Math.max(0, Math.round(clipOffset)),
      vod_offset_ms: Math.round(k.videoOffsetMs),
      victim_agent: k.victimAgent ?? null,
      weapon: k.weapon ?? null,
      round: k.round ?? null,
    })
  }
  return events
}
