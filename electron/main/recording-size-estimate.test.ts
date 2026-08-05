import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MATCH_DURATION_MINUTES,
  estimateRecordingBytes,
  estimateFromPreset,
  exceedsRecordingSizeCap,
  recommendSettingsUnderCap,
} from './recording-size-estimate'
import { COACHING_RECORDING, MAX_RECORDING_FILE_BYTES } from './recording-preset'

describe('estimateRecordingBytes', () => {
  it('scales linearly with bitrate and duration', () => {
    const base = estimateRecordingBytes({
      bitrateMbps: 5,
      fps: 30,
      quality: '720p',
      durationMinutes: 10,
    })
    const doubleBitrate = estimateRecordingBytes({
      bitrateMbps: 10,
      fps: 30,
      quality: '720p',
      durationMinutes: 10,
    })
    const doubleDuration = estimateRecordingBytes({
      bitrateMbps: 5,
      fps: 30,
      quality: '720p',
      durationMinutes: 20,
    })
    expect(doubleBitrate).toBeCloseTo(base * 2, -2)
    expect(doubleDuration).toBeCloseTo(base * 2, -2)
  })

  it('matches coaching preset at default match length', () => {
    const bytes = estimateFromPreset(COACHING_RECORDING, DEFAULT_MATCH_DURATION_MINUTES)
    // 5 Mbps * 42 min ≈ 1.31 GB before overhead
    expect(bytes).toBeGreaterThan(1.2 * 1024 ** 3)
    expect(bytes).toBeLessThan(MAX_RECORDING_FILE_BYTES)
  })

  it('flags creator preset at default duration as over cap', () => {
    const bytes = estimateRecordingBytes({
      bitrateMbps: 10,
      fps: 60,
      quality: '1080p',
      durationMinutes: DEFAULT_MATCH_DURATION_MINUTES,
    })
    expect(exceedsRecordingSizeCap(bytes)).toBe(true)
  })
})

describe('recommendSettingsUnderCap', () => {
  it('returns coaching-safe settings under the upload cap', () => {
    const rec = recommendSettingsUnderCap()
    const bytes = estimateRecordingBytes({
      bitrateMbps: rec.bitrate,
      fps: rec.fps,
      quality: rec.quality,
      durationMinutes: DEFAULT_MATCH_DURATION_MINUTES,
    })
    expect(bytes).toBeLessThanOrEqual(MAX_RECORDING_FILE_BYTES)
  })
})
