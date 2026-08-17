/** Derive a stable percentage from FFmpeg's input duration and latest output timestamp. */
export function parseFfmpegProgress(output: string): number | null {
  const durationMatch = output.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
  if (!durationMatch) return null
  const durationSeconds = Number(durationMatch[1]) * 3600
    + Number(durationMatch[2]) * 60
    + Number(durationMatch[3])
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return null

  const timeMatches = [...output.matchAll(/time=\s*(\d+):(\d+):(\d+(?:\.\d+)?)/g)]
  const latest = timeMatches.at(-1)
  if (!latest) return null
  const elapsedSeconds = Number(latest[1]) * 3600
    + Number(latest[2]) * 60
    + Number(latest[3])
  if (!Number.isFinite(elapsedSeconds)) return null
  return Math.max(0, Math.min(99, Math.floor((elapsedSeconds / durationSeconds) * 100)))
}
