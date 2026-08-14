import { describe, expect, it } from 'vitest'
import { deriveCaptureReadiness, type CaptureReadinessSignals } from './capture-readiness'

const ready: CaptureReadinessSignals = {
  obsConnected: true,
  preflightPassed: true,
  gameDetected: true,
  captureChecked: true,
  captureVerified: true,
  recording: false,
}

describe('capture readiness gate', () => {
  it('only declares safe after OBS, game and capture checks pass', () => {
    expect(deriveCaptureReadiness(ready)).toBe('safe_to_queue')
    expect(deriveCaptureReadiness({ ...ready, obsConnected: false })).toBe('obs_disconnected')
    expect(deriveCaptureReadiness({ ...ready, preflightPassed: false })).toBe('preflight_required')
    expect(deriveCaptureReadiness({ ...ready, gameDetected: false })).toBe('waiting_for_game')
    expect(deriveCaptureReadiness({ ...ready, captureChecked: false })).toBe('checking_capture')
    expect(deriveCaptureReadiness({ ...ready, captureVerified: false })).toBe('capture_blocked')
  })

  it('uses confirmed output as the authoritative active state', () => {
    expect(deriveCaptureReadiness({ ...ready, recording: true })).toBe('recording')
  })
})
