import fs from 'fs'
import path from 'path'
import { expectedMatchSizeGb } from './recording-preset'
import type { AppSettings } from './settings-manager'
import { MIN_RECORDING_FILE_BYTES } from './recording-limits'

export interface RecordingGrowthStats {
  /** Bytes written in the lookback window. */
  bytesInPeriod: number
  filesInPeriod: number
  /** Average bytes per day over the lookback window. */
  bytesPerDay: number
  lookbackDays: number
}

export interface StorageEstimate {
  estimatedGbPerMatch: number
  estimatedGbPerWeek: number
  /** Matches per week assumed for weekly estimate (from recent activity or default). */
  assumedMatchesPerWeek: number
  recent: RecordingGrowthStats
}

const DEFAULT_MATCH_MINUTES = 42
const DEFAULT_MATCHES_PER_WEEK = 10

export function measureRecordingGrowth(
  savePath: string,
  lookbackDays = 7,
): RecordingGrowthStats {
  const empty: RecordingGrowthStats = {
    bytesInPeriod: 0,
    filesInPeriod: 0,
    bytesPerDay: 0,
    lookbackDays,
  }
  if (!savePath || !fs.existsSync(savePath)) return empty

  const cutoff = Date.now() - lookbackDays * 24 * 60 * 60 * 1000
  let bytesInPeriod = 0
  let filesInPeriod = 0

  try {
    for (const name of fs.readdirSync(savePath)) {
      if (!name.toLowerCase().endsWith('.mp4')) continue
      const full = path.join(savePath, name)
      try {
        const stat = fs.statSync(full)
        if (!stat.isFile() || stat.size < MIN_RECORDING_FILE_BYTES) continue
        if (stat.mtimeMs < cutoff) continue
        bytesInPeriod += stat.size
        filesInPeriod++
      } catch { /* ignore */ }
    }
  } catch {
    return empty
  }

  const effectiveDays = Math.max(1, lookbackDays)
  return {
    bytesInPeriod,
    filesInPeriod,
    bytesPerDay: bytesInPeriod / effectiveDays,
    lookbackDays,
  }
}

export function buildStorageEstimate(
  savePath: string,
  settings: Pick<AppSettings, 'recordingPreset' | 'recordingBitrate' | 'fullMatchRecording'>,
  lookbackDays = 7,
): StorageEstimate {
  const recent = measureRecordingGrowth(savePath, lookbackDays)

  if (settings.fullMatchRecording === false) {
    return {
      estimatedGbPerMatch: 0,
      estimatedGbPerWeek: recent.bytesPerDay * 7 / (1024 ** 3),
      assumedMatchesPerWeek: 0,
      recent,
    }
  }

  const bitrate = settings.recordingBitrate ?? 5
  const estimatedGbPerMatch = expectedMatchSizeGb(DEFAULT_MATCH_MINUTES, bitrate)

  const matchesInPeriod = recent.filesInPeriod
  const assumedMatchesPerWeek = matchesInPeriod > 0
    ? Math.max(1, Math.round((matchesInPeriod / lookbackDays) * 7))
    : DEFAULT_MATCHES_PER_WEEK

  const estimatedGbPerWeek = recent.bytesPerDay > 0
    ? (recent.bytesPerDay * 7) / (1024 ** 3)
    : estimatedGbPerMatch * assumedMatchesPerWeek

  return {
    estimatedGbPerMatch,
    estimatedGbPerWeek,
    assumedMatchesPerWeek,
    recent,
  }
}
