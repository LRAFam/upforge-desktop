import fs from 'fs'
import { emptyMatchData } from './recording-sync'
import type { MatchData } from './riot-types'

const MIN_RECOVERY_DURATION_MS = 60_000
const MAX_RECOVERY_DURATION_MS = 8 * 60 * 60_000

export type OrphanRecordingTiming =
  | {
      status: 'ok'
      startTimeMs: number
      endTimeMs: number
      source: 'fs.birthtimeMs+fs.mtimeMs'
    }
  | {
      status: 'missing'
      reason: 'file_stat_failed' | 'invalid_file_times' | 'invalid_recording_duration'
    }

export function orphanRecordingTimingFromStat(input: {
  birthtimeMs: number
  mtimeMs: number
}): OrphanRecordingTiming {
  const { birthtimeMs, mtimeMs } = input
  if (!Number.isFinite(birthtimeMs) || !Number.isFinite(mtimeMs) || birthtimeMs <= 0 || mtimeMs <= 0) {
    return { status: 'missing', reason: 'invalid_file_times' }
  }

  const durationMs = mtimeMs - birthtimeMs
  if (durationMs < MIN_RECOVERY_DURATION_MS || durationMs > MAX_RECOVERY_DURATION_MS) {
    return { status: 'missing', reason: 'invalid_recording_duration' }
  }

  return {
    status: 'ok',
    startTimeMs: birthtimeMs,
    endTimeMs: mtimeMs,
    source: 'fs.birthtimeMs+fs.mtimeMs',
  }
}

export function inspectOrphanRecordingTiming(filePath: string): OrphanRecordingTiming {
  try {
    const stat = fs.statSync(filePath)
    return orphanRecordingTimingFromStat({
      birthtimeMs: stat.birthtimeMs,
      mtimeMs: stat.mtimeMs,
    })
  } catch {
    return { status: 'missing', reason: 'file_stat_failed' }
  }
}

export function buildOrphanValorantTimeline(
  timing: Extract<OrphanRecordingTiming, { status: 'ok' }>,
  identity: { name: string | null; tag: string | null },
): MatchData {
  const timeline = emptyMatchData('valorant', timing.startTimeMs)
  timeline.playerName = identity.name?.trim() || null
  timeline.playerTag = identity.tag?.trim() || null
  timeline.endTime = timing.endTimeMs
  return timeline
}
