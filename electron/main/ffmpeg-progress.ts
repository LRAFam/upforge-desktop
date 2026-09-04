/** Derive a stable percentage from FFmpeg's input duration and latest output timestamp. */
export function parseFfmpegProgress(output: string): number | null {
  const durationMatch = output.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
  if (!durationMatch) return null
  const durationSeconds = Number(durationMatch[1]) * 3600
    + Number(durationMatch[2]) * 60
    + Number(durationMatch[3])
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return null

  let latest: RegExpMatchArray | undefined
  for (const match of output.matchAll(/time=\s*(\d+):(\d+):(\d+(?:\.\d+)?)/g)) latest = match
  if (!latest) return null
  const elapsedSeconds = Number(latest[1]) * 3600
    + Number(latest[2]) * 60
    + Number(latest[3])
  if (!Number.isFinite(elapsedSeconds)) return null
  return Math.max(0, Math.min(99, Math.floor((elapsedSeconds / durationSeconds) * 100)))
}

/** Reads each stderr record once and retains only an incomplete line. */
export class FfmpegProgressParser {
  private pending = ''
  private duration: number | null = null
  private elapsed: number | null = null

  push(chunk: string): number | null {
    const lines = (this.pending + chunk).split(/[\r\n]/)
    this.pending = lines.pop()!.slice(-4096)
    for (const line of lines) {
      const duration = line.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
      if (duration) this.duration = this.seconds(duration)
      const time = line.match(/time=\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
      if (time) this.elapsed = this.seconds(time)
    }
    if (!this.duration || this.duration <= 0 || this.elapsed === null) return null
    return Math.max(0, Math.min(99, Math.floor(this.elapsed / this.duration * 100)))
  }

  private seconds(match: RegExpMatchArray): number {
    return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
  }
}
