/**
 * Recording presets — coaching (default) vs creator (Pro).
 * Upload compression always targets the coaching preset for AI analysis cost.
 *
 * Creator unlocks a 720p / 1080p choice; both always sync canvas/fps into OBS.
 */

/** Creator preset — Pro subscription required. */
export type RecordingPresetId = 'coaching' | 'creator'

export type RecordingQuality = '720p' | '1080p'

export interface RecordingPresetValues {
  quality: RecordingQuality
  bitrate: number // Mbps
  fps: 24 | 30 | 60
  /** When false, UpForge does not override OBS canvas resolution/fps. */
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

export const CREATOR_RECORDING_1080: RecordingPresetValues = {
  quality: '1080p',
  bitrate: 10,
  fps: 60,
  manageObsVideo: true,
  label: '1080p · 10 Mbps · 60 fps',
}

/** @deprecated use CREATOR_RECORDING_1080 */
export const CREATOR_RECORDING = CREATOR_RECORDING_1080

/** Preset used when re-encoding oversized files for upload. */
export const UPLOAD_COMPRESSION_PRESET = COACHING_RECORDING

/** @deprecated use COACHING_RECORDING */
export const RECORDING_PRESET = COACHING_RECORDING

/** @deprecated use COACHING_RECORDING.label */
export const RECORDING_PRESET_LABEL = COACHING_RECORDING.label

export function getRecordingPresetValues(preset: RecordingPresetId): RecordingPresetValues {
  return preset === 'creator' ? CREATOR_RECORDING_1080 : COACHING_RECORDING
}

/**
 * Resolve effective recording output from preset + optional Creator quality.
 * Free / non-Pro always get Coaching. Creator 720p matches Coaching numbers but keeps the Creator path.
 */
export function resolveRecordingOutput(opts: {
  recordingPreset?: RecordingPresetId | string | null
  recordingQuality?: RecordingQuality | string | null
  allowCreator?: boolean
}): RecordingPresetValues & { recordingPreset: RecordingPresetId } {
  const allowCreator = opts.allowCreator !== false
  const wantsCreator = opts.recordingPreset === 'creator' && allowCreator
  if (!wantsCreator) {
    return { recordingPreset: 'coaching', ...COACHING_RECORDING }
  }
  const quality: RecordingQuality = opts.recordingQuality === '720p' ? '720p' : '1080p'
  if (quality === '720p') {
    return {
      recordingPreset: 'creator',
      quality: '720p',
      bitrate: COACHING_RECORDING.bitrate,
      fps: COACHING_RECORDING.fps,
      manageObsVideo: true,
      label: COACHING_RECORDING.label,
    }
  }
  return { recordingPreset: 'creator', ...CREATOR_RECORDING_1080 }
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
