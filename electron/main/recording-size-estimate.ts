import {
  COACHING_RECORDING,
  MAX_RECORDING_FILE_BYTES,
  type RecordingPresetValues,
} from './recording-preset'
import type { AppSettings } from './settings-manager'

/** Typical Valorant / CS2 match length used for preflight size warnings. */
export const DEFAULT_MATCH_DURATION_MINUTES = 42

/** Mux / container overhead above raw video bitrate. */
const CONTAINER_OVERHEAD_RATIO = 1.05

export interface RecordingSizeEstimateInput {
  bitrateMbps: number
  fps: number
  quality: '720p' | '1080p'
  durationMinutes?: number
}

export function estimateRecordingBytes(input: RecordingSizeEstimateInput): number {
  const durationMinutes = input.durationMinutes ?? DEFAULT_MATCH_DURATION_MINUTES
  const seconds = durationMinutes * 60
  // Size is dominated by video bitrate; fps/resolution inform preset choice, not byte math.
  void input.fps
  void input.quality
  const rawBytes = (input.bitrateMbps * 1_000_000 * seconds) / 8
  return Math.round(rawBytes * CONTAINER_OVERHEAD_RATIO)
}

export function estimateFromSettings(
  settings: Pick<AppSettings, 'recordingBitrate' | 'recordingFps' | 'recordingQuality' | 'fullMatchRecording'>,
  durationMinutes = DEFAULT_MATCH_DURATION_MINUTES,
): number {
  if (settings.fullMatchRecording === false) return 0
  const quality = settings.recordingQuality === '1080p' ? '1080p' : '720p'
  return estimateRecordingBytes({
    bitrateMbps: settings.recordingBitrate ?? COACHING_RECORDING.bitrate,
    fps: settings.recordingFps ?? COACHING_RECORDING.fps,
    quality,
    durationMinutes,
  })
}

export function estimateFromPreset(
  preset: Pick<RecordingPresetValues, 'bitrate' | 'fps' | 'quality'>,
  durationMinutes = DEFAULT_MATCH_DURATION_MINUTES,
): number {
  return estimateRecordingBytes({
    bitrateMbps: preset.bitrate,
    fps: preset.fps,
    quality: preset.quality,
    durationMinutes,
  })
}

export function exceedsRecordingSizeCap(estimateBytes: number): boolean {
  return estimateBytes > MAX_RECORDING_FILE_BYTES
}

export interface RecommendedRecordingSettings {
  quality: '720p' | '1080p'
  bitrate: number
  fps: 24 | 30 | 60
}

/** Step down preset until a full match fits under MAX_RECORDING_FILE_BYTES. */
export function recommendSettingsUnderCap(
  durationMinutes = DEFAULT_MATCH_DURATION_MINUTES,
): RecommendedRecordingSettings {
  const candidates: RecommendedRecordingSettings[] = [
    { quality: '720p', bitrate: 5, fps: 30 },
    { quality: '720p', bitrate: 4, fps: 30 },
    { quality: '720p', bitrate: 3, fps: 24 },
  ]
  for (const candidate of candidates) {
    if (
      estimateRecordingBytes({
        bitrateMbps: candidate.bitrate,
        fps: candidate.fps,
        quality: candidate.quality,
        durationMinutes,
      }) <= MAX_RECORDING_FILE_BYTES
    ) {
      return candidate
    }
  }
  return candidates[candidates.length - 1]!
}
