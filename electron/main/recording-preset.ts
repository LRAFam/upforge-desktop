/**
 * Recording presets — coaching (default) vs creator (high quality).
 * Upload compression always targets the coaching preset for AI analysis cost.
 */

/** Creator preset (1080p60) — Pro subscription required. */
export type RecordingPresetId = 'coaching' | 'creator'

export interface RecordingPresetValues {
  quality: '720p' | '1080p'
  bitrate: number // Mbps
  fps: 24 | 30 | 60
  /** When false, UpForge does not override OBS canvas resolution/fps (creator/streaming). */
  manageObsVideo: boolean
  label: string
}

export const COACHING_RECORDING: RecordingPresetValues = {
  quality: '720p',
  bitrate: 5,
  fps: 30,
  manageObsVideo: true,
  label: '720p · 5 Mbps · 30 fps',
}

export const CREATOR_RECORDING: RecordingPresetValues = {
  quality: '1080p',
  bitrate: 10,
  fps: 60,
  manageObsVideo: false,
  label: '1080p · 10 Mbps · 60 fps',
}

/** Preset used when re-encoding oversized files for upload. */
export const UPLOAD_COMPRESSION_PRESET = COACHING_RECORDING

/** @deprecated use COACHING_RECORDING */
export const RECORDING_PRESET = COACHING_RECORDING

/** @deprecated use COACHING_RECORDING.label */
export const RECORDING_PRESET_LABEL = COACHING_RECORDING.label

export function getRecordingPresetValues(preset: RecordingPresetId): RecordingPresetValues {
  return preset === 'creator' ? CREATOR_RECORDING : COACHING_RECORDING
}

export function formatRecordingLabel(quality: string, bitrate: number, fps: number): string {
  return `${quality} · ${bitrate} Mbps · ${fps} fps`
}

/** Typical match file size in GB at a given bitrate. */
export function expectedMatchSizeGb(durationMinutes: number, bitrateMbps = COACHING_RECORDING.bitrate): number {
  const seconds = durationMinutes * 60
  return (bitrateMbps * seconds) / 8 / 1024
}

/** Safety cap for uploads after compression; normal matches stay well under this. */
export const MAX_RECORDING_FILE_BYTES = Math.round(2.5 * 1024 * 1024 * 1024)

export const MAX_RECORDING_FILE_GB = MAX_RECORDING_FILE_BYTES / (1024 * 1024 * 1024)
