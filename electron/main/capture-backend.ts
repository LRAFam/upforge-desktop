/**
 * Match recording uses OBS WebSocket only.
 * Bundled ffmpeg remains for post-match clip extraction (see clip-extractor.ts).
 */

export type RecordingBackend = 'obs'

export function formatRecordingFailure(
  _backend: RecordingBackend,
  lastError: string | null,
): string {
  if (lastError) return `Recording failed: ${lastError}`
  return 'Recording file was not created — OBS may have stopped recording or disconnected.'
}

export function formatCorruptRecordingMessage(
  _backend: RecordingBackend,
  sizeMB: string,
): string {
  return `Recording appears corrupt or empty (${sizeMB} MB). Check OBS is running and review OBS logs.`
}
