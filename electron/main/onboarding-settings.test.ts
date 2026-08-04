import { describe, expect, it } from 'vitest'
import { migrateOnboardingFlags, withOnboardingComplete } from './onboarding-settings'

describe('migrateOnboardingFlags', () => {
  it('marks legacy Welcome users complete when firstRun is false and onboardingComplete is missing', () => {
    const input = { firstRun: false, primaryGame: 'valorant' as const }
    expect(migrateOnboardingFlags(input)).toEqual({
      firstRun: false,
      primaryGame: 'valorant',
      onboardingComplete: true,
    })
  })

  it('does not auto-complete when firstRun is true', () => {
    expect(migrateOnboardingFlags({ firstRun: true })).toEqual({ firstRun: true })
    expect(migrateOnboardingFlags({ firstRun: true, onboardingComplete: undefined })).toEqual({
      firstRun: true,
      onboardingComplete: undefined,
    })
  })

  it('leaves explicit onboardingComplete false unchanged', () => {
    expect(migrateOnboardingFlags({ firstRun: false, onboardingComplete: false })).toEqual({
      firstRun: false,
      onboardingComplete: false,
    })
  })

  it('leaves explicit onboardingComplete true unchanged', () => {
    expect(migrateOnboardingFlags({ firstRun: false, onboardingComplete: true })).toEqual({
      firstRun: false,
      onboardingComplete: true,
    })
  })

  it('does not mutate the input object', () => {
    const input = { firstRun: false }
    const result = migrateOnboardingFlags(input)
    expect(input).toEqual({ firstRun: false })
    expect(result).not.toBe(input)
  })
})

describe('withOnboardingComplete', () => {
  it('forces firstRun false when onboardingComplete is true', () => {
    expect(withOnboardingComplete({ onboardingComplete: true })).toEqual({
      onboardingComplete: true,
      firstRun: false,
    })
    expect(withOnboardingComplete({ firstRun: true, onboardingComplete: true })).toEqual({
      firstRun: false,
      onboardingComplete: true,
    })
  })

  it('returns partial unchanged when onboardingComplete is not true', () => {
    expect(withOnboardingComplete({ firstRun: true })).toEqual({ firstRun: true })
    expect(withOnboardingComplete({ onboardingComplete: false })).toEqual({
      onboardingComplete: false,
    })
  })
})
