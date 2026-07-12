import { describe, expect, it } from 'vitest'
import {
  isRetryableProbeFailure,
  parseFfmpegProbeStderr,
  probeTimeoutMs,
  shouldReportClipProbeFailure,
} from './ffmpeg-probe'

describe('parseFfmpegProbeStderr', () => {
  it('accepts valid metadata', () => {
    const stderr = `Input #0, mov,mp4, from 'match.mp4':
  Duration: 00:42:10.00, start: 0.000000, bitrate: 4500 kb/s
  Stream #0:0: Video: h264, yuv420p, 1920x1080`
    expect(parseFfmpegProbeStderr(stderr)).toEqual({ ok: true })
  })

  it('detects missing moov atom', () => {
    const result = parseFfmpegProbeStderr('[mov,mp4] moov atom not found')
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/moov atom/i)
  })
})

describe('probe helpers', () => {
  it('marks moov and timeout as retryable', () => {
    expect(isRetryableProbeFailure('ffmpeg timed out')).toBe(true)
    expect(isRetryableProbeFailure('moov atom not found')).toBe(true)
    expect(isRetryableProbeFailure('unknown codec')).toBe(false)
  })

  it('does not report expected clip probe failures', () => {
    expect(shouldReportClipProbeFailure('ffmpeg timed out')).toBe(false)
    expect(shouldReportClipProbeFailure('Recording is incomplete — moov atom not found')).toBe(false)
    expect(shouldReportClipProbeFailure('unknown codec xyz')).toBe(true)
  })

  it('scales timeout with file size', () => {
    expect(probeTimeoutMs(10 * 1024 * 1024)).toBe(20_000)
    expect(probeTimeoutMs(500 * 1024 * 1024)).toBeGreaterThan(20_000)
    expect(probeTimeoutMs(5_000 * 1024 * 1024)).toBe(60_000)
  })
})
