/**
 * Fixed recording preset — not user-configurable.
 * Tuned for AI coaching (readable UI, smooth motion) at minimal S3 cost.
 *
 * ~1.3 GB / 45 min comp match · ~1.7 GB / 60 min at this bitrate.
 */

export const RECORDING_PRESET = {
  quality: '720p' as const,
  bitrate: 5, // Mbps
  fps: 30 as const,
}

export const RECORDING_PRESET_LABEL = '720p · 5 Mbps · 30 fps'

/** Safety cap — rejects runaway OBS configs; normal matches stay well under this. */
export const MAX_RECORDING_FILE_BYTES = Math.round(2.5 * 1024 * 1024 * 1024)

export const MAX_RECORDING_FILE_GB = MAX_RECORDING_FILE_BYTES / (1024 * 1024 * 1024)

export function expectedMatchSizeGb(durationMinutes: number): number {
  const seconds = durationMinutes * 60
  return (RECORDING_PRESET.bitrate * seconds) / 8 / 1024
}
