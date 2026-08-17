import { describe, expect, it } from 'vitest'
import { shouldMinimizeForDetectedGame, shouldOpenPostGameWindow } from './onboarding-window-policy'

describe('onboarding window policy', () => {
  it('keeps the mission visible while onboarding is proving capture', () => {
    expect(shouldMinimizeForDetectedGame(true)).toBe(false)
  })

  it('preserves normal automatic minimising outside onboarding', () => {
    expect(shouldMinimizeForDetectedGame(false)).toBe(true)
  })

  it('keeps onboarding post-match progress in the main window', () => {
    expect(shouldOpenPostGameWindow(true, false)).toBe(false)
  })

  it('opens the compact post-match window for normal supported matches', () => {
    expect(shouldOpenPostGameWindow(false, false)).toBe(true)
    expect(shouldOpenPostGameWindow(false, true)).toBe(false)
  })
})
