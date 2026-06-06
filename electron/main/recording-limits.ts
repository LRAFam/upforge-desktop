import {
  MAX_RECORDING_FILE_BYTES,
  MAX_RECORDING_FILE_GB,
} from './recording-preset'

export {
  MAX_RECORDING_FILE_BYTES,
  MAX_RECORDING_FILE_GB,
}

/** Minimum match length worth analysing (seconds). */
export const MIN_RECORDING_DURATION_SECONDS = 120

/** Reject corrupt / empty mux output below 1 MB. */
export const MIN_RECORDING_FILE_BYTES = 1024 * 1024

export function formatRecordingTooLargeMessage(sizeBytes: number, clipsSaved: boolean): string {
  const sizeGB = (sizeBytes / (1024 * 1024 * 1024)).toFixed(1)
  const clipsNote = clipsSaved
    ? ' Highlight clips were still saved locally.'
    : ''
  return (
    `Recording is too large for upload (${sizeGB} GB — max ${MAX_RECORDING_FILE_GB.toFixed(1)} GB).${clipsNote} ` +
    'UpForge will compress oversized files automatically — if this persists, set OBS Output Mode to Simple and restart OBS.'
  )
}
