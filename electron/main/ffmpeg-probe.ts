/**
 * Parse ffmpeg stderr from a metadata-only probe.
 *
 * Prefer probing with `-f null -` so healthy files produce empty error output
 * (or only Duration/Video lines when verbosity is higher). With `-i` alone,
 * ffmpeg always ends with "At least one output file must be specified" — treat
 * that as noise, not a failure.
 */

export function parseFfmpegProbeStderr(stderr: string): { ok: boolean; reason?: string } {
  // ffmpeg complains when no output muxer is given — that is not a media error.
  const text = stderr
    .replace(/At least one output file must be specified\.?/gi, '')
    .trim()

  if (/moov atom not found/i.test(text)) {
    return {
      ok: false,
      reason:
        'Recording is incomplete — moov atom not found. ffmpeg likely exited before finalising the file.',
    }
  }
  if (/invalid data found when processing input/i.test(text)) {
    return { ok: false, reason: 'Recording is incomplete — invalid container data.' }
  }
  if (/no such file or directory/i.test(text)) {
    return { ok: false, reason: 'Recording file not found.' }
  }
  if (!text || /Video:\s/.test(text) || /Duration:\s*\d+:\d+/.test(text)) {
    return { ok: true }
  }
  return { ok: false, reason: text.slice(0, 200) }
}

export function isRetryableProbeFailure(reason: string | undefined): boolean {
  if (!reason) return false
  return /moov atom|timed out|finalis/i.test(reason)
}

export function shouldReportClipProbeFailure(reason: string | undefined): boolean {
  if (!reason) return false
  if (isRetryableProbeFailure(reason)) return false
  if (/incomplete|invalid container|too small|not found/i.test(reason)) return false
  return true
}

/** Scale probe timeout with file size — large OBS files on slow disks need more headroom. */
export function probeTimeoutMs(fileSizeBytes: number): number {
  const per50Mb = Math.ceil(fileSizeBytes / (50 * 1024 * 1024)) * 5_000
  return Math.min(60_000, Math.max(20_000, per50Mb))
}
