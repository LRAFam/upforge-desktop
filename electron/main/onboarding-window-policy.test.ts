import { describe, expect, it } from 'vitest'
import { shouldMinimizeForDetectedGame, shouldOpenPostGameWindow } from './onboarding-window-policy'

describe('onboarding window policy', () => {
  it('keeps the mission visible while onboarding is proving capture', () => {
    expect(shouldMinimizeForDetectedGame(true)).toBe(false)
  })

  it('keeps unfinished account and recording setup visible when a game is already open', () => {
    expect(shouldMinimizeForDetectedGame(false, true)).toBe(false)
    expect(shouldMinimizeForDetectedGame(true, true)).toBe(false)
  })

  it.each([
    'file:///C:/UpForge/index.html#/onboarding',
    'http://localhost:5173/#/onboarding?from=campaign',
  ])('keeps campaign onboarding visible after local setup was completed (%s)', (windowUrl) => {
    expect(shouldMinimizeForDetectedGame(false, false, windowUrl)).toBe(false)
  })

  it('allows normal minimising after leaving campaign onboarding', () => {
    expect(shouldMinimizeForDetectedGame(false, false, 'file:///C:/UpForge/index.html#/dashboard')).toBe(true)
    expect(shouldMinimizeForDetectedGame(false, false, 'http://localhost:5173/#/settings?from=onboarding')).toBe(true)
  })

  it('preserves normal automatic minimising outside onboarding', () => {
    expect(shouldMinimizeForDetectedGame(false)).toBe(true)
    expect(shouldMinimizeForDetectedGame(false, false)).toBe(true)
  })

  it('keeps onboarding post-match progress in the main window', () => {
    expect(shouldOpenPostGameWindow(true, false)).toBe(false)
  })

  it('opens the compact post-match window for normal supported matches', () => {
    expect(shouldOpenPostGameWindow(false, false)).toBe(true)
    expect(shouldOpenPostGameWindow(false, true)).toBe(false)
  })
})
