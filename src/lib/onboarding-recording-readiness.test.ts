import { describe, expect, it } from 'vitest'
import { hasVerifiedOnboardingRecording } from './onboarding-recording-readiness'

describe('onboarding recording readiness', () => {
  it('does not treat connecting or skipping a failed test as ready', () => {
    expect(hasVerifiedOnboardingRecording({ connected: true, testPassed: false })).toBe(false)
    expect(hasVerifiedOnboardingRecording({ connected: false, testPassed: false })).toBe(false)
  })

  it('requires both a passed test and a current connection', () => {
    expect(hasVerifiedOnboardingRecording({ connected: true, testPassed: true })).toBe(true)
    expect(hasVerifiedOnboardingRecording({ connected: false, testPassed: true })).toBe(false)
  })
})
