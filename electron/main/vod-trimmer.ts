/**
 * Trim a local match VOD and shift timeline markers to match the new file window.
 */

import fs from 'fs'
import { recomputeTimelineVideoOffsets, type MatchData } from './riot-local-api'

export interface VodTrimRange {
  startSec: number
  endSec: number
}

function trimDurationMs(range: VodTrimRange): number {
  return Math.round((range.endSec - range.startSec) * 1000)
}

function inTrimWindow(ms: number | undefined | null, trimDurMs: number): boolean {
  return ms != null && ms >= 0 && ms < trimDurMs
}

/** Shift timeline markers after cutting [startSec, endSec) from the recording file. */
export function applyVodTrimToTimeline(timeline: MatchData, range: VodTrimRange): void {
  const startMs = Math.round(range.startSec * 1000)
  const endMs = Math.round(range.endSec * 1000)
  const trimDurMs = trimDurationMs(range)

  if (timeline.recordingStartTime != null) timeline.recordingStartTime += startMs
  if (timeline.gameplayStartTime != null) timeline.gameplayStartTime += startMs
  if (timeline.matchStartTime != null) timeline.matchStartTime += startMs
  if (timeline.startTime != null) timeline.startTime += startMs

  recomputeTimelineVideoOffsets(timeline)

  const keepEvent = <T extends { videoOffsetMs?: number }>(ev: T): boolean =>
    inTrimWindow(ev.videoOffsetMs, trimDurMs)

  timeline.playerKills = (timeline.playerKills ?? []).filter(keepEvent)
  timeline.playerDeaths = (timeline.playerDeaths ?? []).filter(keepEvent)
  timeline.killEvents = (timeline.killEvents ?? []).filter(keepEvent)
  timeline.firstBloods = (timeline.firstBloods ?? []).filter(keepEvent)
  timeline.spikePlants = (timeline.spikePlants ?? []).filter(keepEvent)
  timeline.spikeDefuses = (timeline.spikeDefuses ?? []).filter(keepEvent)
  timeline.spikeDetonations = (timeline.spikeDetonations ?? []).filter(keepEvent)

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

/** Replace targetPath with trimmedPath, keeping a short-lived backup on failure. */
export function swapMediaFileInPlace(targetPath: string, trimmedPath: string): void {
  const backupPath = `${targetPath}.bak`
  try {
    fs.renameSync(targetPath, backupPath)
    try {
      fs.renameSync(trimmedPath, targetPath)
      try { fs.unlinkSync(backupPath) } catch { /* non-fatal */ }
    } catch (renameErr) {
      try { fs.renameSync(backupPath, targetPath) } catch { /* best-effort restore */ }
      throw renameErr
    }
  } catch {
    try { fs.unlinkSync(targetPath) } catch { /* ignore */ }
    fs.renameSync(trimmedPath, targetPath)
  }
}

export function trimmedOutputPath(sourcePath: string): string {
  return sourcePath.replace(/\.(mp4|mkv|webm|mov|m4v)$/i, '_trimmed.mp4')
}
