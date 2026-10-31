import { describe, expect, it } from 'vitest'
import { resolveOnboardingStep } from './onboarding-flow'

describe('onboarding resumes only the missing work', () => {
  const linkedPlayer = { authenticated: true, hasSavedGame: true, accountLinked: true, activeMission: false }

  it('takes a returning signed-in player directly to the capture check', () => {
    expect(resolveOnboardingStep(linkedPlayer)).toBe(4)
  })

  it('asks for a game when the profile has not supplied one', () => {
    expect(resolveOnboardingStep({ ...linkedPlayer, hasSavedGame: false })).toBe(2)
  })

  it('offers linking when the selected game has no linked account', () => {
    expect(resolveOnboardingStep({ ...linkedPlayer, accountLinked: false })).toBe(3)
  })

  it('resumes an existing match review instead of restarting capture setup', () => {
    expect(resolveOnboardingStep({ ...linkedPlayer, hasSavedGame: false, activeMission: true })).toBe(5)
  })

  it('requires authentication even when local state contains an old mission', () => {
    expect(resolveOnboardingStep({ ...linkedPlayer, authenticated: false, activeMission: true })).toBe(1)
  })
})
