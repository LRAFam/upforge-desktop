import { describe, expect, it } from 'vitest'
import {
  findLatestOnboardingRecording,
  isPostGameBusy,
  shouldMinimizeOnboardingForRecording,
  shouldPollOnboardingMission,
  shouldRequestOnboardingPreview,
} from './onboarding-capture-preview'

const ready = {
  missionActive: true,
  valorantDetected: true,
  recording: false,
  onboardingRecordingFound: false,
  postGamePhase: null,
  previewInFlight: false,
  force: false,
  now: 10_000,
  lastCapturedAt: 0,
}

describe('onboarding capture preview policy', () => {
  it('keeps a visual preview inert but polls once a live admin mission starts', () => {
    expect(shouldPollOnboardingMission(true, false)).toBe(false)
    expect(shouldPollOnboardingMission(true, true)).toBe(true)
    expect(shouldPollOnboardingMission(false, false)).toBe(true)
  })

  it('minimizes an active onboarding window once per confirmed recording', () => {
    expect(shouldMinimizeOnboardingForRecording({
      missionActive: true,
      recording: true,
      alreadyMinimized: false,
    })).toBe(true)
    expect(shouldMinimizeOnboardingForRecording({
      missionActive: true,
      recording: true,
      alreadyMinimized: true,
    })).toBe(false)
    expect(shouldMinimizeOnboardingForRecording({
      missionActive: false,
      recording: true,
      alreadyMinimized: false,
    })).toBe(false)
  })

  it('allows a preview once Valorant is detected and the refresh interval elapsed', () => {
    expect(shouldRequestOnboardingPreview(ready)).toBe(true)
  })

  it('does not overlap preview requests', () => {
    expect(shouldRequestOnboardingPreview({ ...ready, previewInFlight: true })).toBe(false)
    expect(shouldRequestOnboardingPreview({ ...ready, previewInFlight: true, force: true })).toBe(false)
  })

  it('stops preview work during recording and post-match processing', () => {
    expect(shouldRequestOnboardingPreview({ ...ready, recording: true })).toBe(false)
    expect(shouldRequestOnboardingPreview({ ...ready, postGamePhase: 'preparing' })).toBe(false)
    expect(shouldRequestOnboardingPreview({ ...ready, postGamePhase: 'uploading' })).toBe(false)
    expect(shouldRequestOnboardingPreview({ ...ready, postGamePhase: 'analysing' })).toBe(false)
    expect(shouldRequestOnboardingPreview({ ...ready, postGamePhase: 'pending' })).toBe(false)
  })

  it('does not preview again after the onboarding recording is persisted', () => {
    expect(shouldRequestOnboardingPreview({ ...ready, onboardingRecordingFound: true })).toBe(false)
  })

  it('only treats active post-match phases as busy', () => {
    expect(isPostGameBusy('ready')).toBe(false)
    expect(isPostGameBusy('error')).toBe(false)
    expect(isPostGameBusy(null)).toBe(false)
  })

  it('keeps a completed onboarding analysis visible after it leaves the pending list', () => {
    const completed = { id: 'new', onboardingBonus: true, recordedAt: 2_000, analysisId: 42 }
    expect(findLatestOnboardingRecording([
      { id: 'normal', recordedAt: 3_000 },
      { id: 'old', onboardingBonus: true, recordedAt: 500, analysisId: 12 },
      completed,
    ], 1_000)).toEqual(completed)
  })
})
