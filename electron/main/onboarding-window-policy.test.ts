import { describe, expect, it } from 'vitest'
import { shouldMinimizeForDetectedGame } from './onboarding-window-policy'

describe('onboarding window policy', () => {
  it('keeps the mission visible while onboarding is proving capture', () => {
    expect(shouldMinimizeForDetectedGame(true)).toBe(false)
  })

  it('preserves normal automatic minimising outside onboarding', () => {
    expect(shouldMinimizeForDetectedGame(false)).toBe(true)
  })
})
