import { describe, expect, it } from 'vitest'
import { shouldResumeMatchDetectionOnObsConnect } from './obs-match-resume'

describe('shouldResumeMatchDetectionOnObsConnect', () => {
  const base = {
    activeGame: 'valorant' as string | null,
    waitingForMatch: false,
    isActivelyRecording: false,
    matchDetectInFlight: false,
  }

  it('resumes when a game is active and nothing else is in flight', () => {
    expect(shouldResumeMatchDetectionOnObsConnect(base)).toBe(true)
  })

  it('skips when no game is tracked', () => {
    expect(shouldResumeMatchDetectionOnObsConnect({ ...base, activeGame: null })).toBe(false)
  })

  it('skips while already waiting for a match', () => {
    expect(shouldResumeMatchDetectionOnObsConnect({ ...base, waitingForMatch: true })).toBe(false)
  })

  it('skips while UpForge owns an active recording', () => {
    expect(shouldResumeMatchDetectionOnObsConnect({ ...base, isActivelyRecording: true })).toBe(false)
  })

  it('skips while a game-started handler is already running (OBS connect mid-ensure)', () => {
    expect(shouldResumeMatchDetectionOnObsConnect({ ...base, matchDetectInFlight: true })).toBe(false)
  })

  it('skips when match ownership is held after a WebSocket drop', () => {
    expect(shouldResumeMatchDetectionOnObsConnect({ ...base, matchOwnedRecording: true })).toBe(false)
  })

  it('skips while reclaiming after disconnect-during-recording', () => {
    expect(shouldResumeMatchDetectionOnObsConnect({
      ...base,
      disconnectedDuringRecording: true,
    })).toBe(false)
  })
})
