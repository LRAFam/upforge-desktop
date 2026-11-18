/**
 * Trim a local match VOD and shift timeline markers to match the new file window.
 */

import { replaceClipFileKeepingOriginal } from './clip-timing'
import { recomputeTimelineVideoOffsets, type MatchData } from './riot-local-api'

export interface VodTrimRange {
  startSec: number
  endSec: number
}

function trimDurationMs(range: VodTrimRange): number {
  return Math.round((range.endSec - range.startSec) * 1000)
}

type Seekable = { videoOffsetMs?: number }

/**
 * Shift timeline markers after cutting the file down to [startSec, endSec).
 *
 * Trimming moves where the file starts, not when the match happened: game-clock epochs
 * (matchStartTime, gameplayStartTime) stay as they are. recordingStartTime moves to the new
 * first frame, the file-relative anchors (measured round-timer offset, CS2 demo shift) move back
 * by the cut, and vodTrimStartMs remembers the cut for the loading-time estimates. Events are
 * kept by their position in the old file, so nothing inside the kept window is lost.
 */
export function applyVodTrimToTimeline(timeline: MatchData, range: VodTrimRange): void {
  const startMs = Math.round(range.startSec * 1000)
  const endMs = Math.round(range.endSec * 1000)
  const trimDurMs = trimDurationMs(range)

  // Positions in the file as it is now (before the cut).
  recomputeTimelineVideoOffsets(timeline)
  const inWindow = (ev: Seekable): boolean =>
    ev.videoOffsetMs != null && ev.videoOffsetMs >= startMs && ev.videoOffsetMs < endMs
  const keepAndShift = <T extends Seekable>(events: T[] | undefined): T[] =>
    (events ?? []).filter(inWindow).map((ev) => {
      ev.videoOffsetMs = ev.videoOffsetMs! - startMs
      return ev
    })

  // Spatial seek points follow their source events by index, so decide them before filtering.
  const spatial = timeline.spatialSummary?.events
  if (spatial?.length) {
    const sources: Record<string, Seekable[] | undefined> = {
      death: timeline.playerDeaths,
      kill: timeline.playerKills,
      plant: timeline.spikePlants,
      defuse: timeline.spikeDefuses,
    }
    const seen: Record<string, number> = {}
    timeline.spatialSummary!.events = spatial.filter((ev) => {
      const i = seen[ev.type] ?? 0
      seen[ev.type] = i + 1
      const src = sources[ev.type]?.[i]
      return src ? inWindow(src) : ev.videoOffsetMs != null && inWindow(ev)
    })
  }

  timeline.playerKills = keepAndShift(timeline.playerKills)
  timeline.playerDeaths = keepAndShift(timeline.playerDeaths)
  timeline.killEvents = keepAndShift(timeline.killEvents)
  timeline.firstBloods = keepAndShift(timeline.firstBloods)
  timeline.spikePlants = keepAndShift(timeline.spikePlants)
  timeline.spikeDefuses = keepAndShift(timeline.spikeDefuses)
  timeline.spikeDetonations = keepAndShift(timeline.spikeDetonations)
  if (timeline.objectiveEvents) timeline.objectiveEvents = keepAndShift(timeline.objectiveEvents)

  if (timeline.recordingStartTime != null) timeline.recordingStartTime += startMs
  if (timeline.startTime != null) timeline.startTime += startMs
  timeline.vodTrimStartMs = (timeline.vodTrimStartMs ?? 0) + startMs
  if (timeline.roundTimerOffsetMs != null) timeline.roundTimerOffsetMs -= startMs
  if (timeline.cs2DemoVideoShiftMs != null) timeline.cs2DemoVideoShiftMs -= startMs

  // Same positions from the anchors (also re-syncs spatial seek points); markers without a game
  // time keep the shifted position set above.
  recomputeTimelineVideoOffsets(timeline)

  if (timeline.duelMoments?.length) {
    timeline.duelMoments = timeline.duelMoments
      .filter((m) => {
        const anchor = m.video_offset_ms ?? m.window_start_ms
        return anchor >= startMs && anchor < endMs
      })
      .map((m) => ({
        ...m,
        video_offset_ms: m.video_offset_ms - startMs,
        window_start_ms: Math.max(0, m.window_start_ms - startMs),
        window_end_ms: Math.min(trimDurMs, m.window_end_ms - startMs),
      }))
  }

  if (timeline.endTime != null && timeline.startTime != null) {
    timeline.endTime = timeline.startTime + trimDurMs
  }
}

/**
 * Replace targetPath with trimmedPath. On any failure the original stays at targetPath (or, if
 * even the restore fails, at `targetPath.bak`, named in the error) — it is never deleted.
 */
export function swapMediaFileInPlace(targetPath: string, trimmedPath: string): void {
  replaceClipFileKeepingOriginal(targetPath, trimmedPath)
}

export function trimmedOutputPath(sourcePath: string): string {
  const out = sourcePath.replace(/\.(mp4|mkv|webm|mov|m4v)$/i, '_trimmed.mp4')
  // Never let the temporary output alias the original — failure cleanup deletes it.
  return out === sourcePath ? `${sourcePath}_trimmed.mp4` : out
}
