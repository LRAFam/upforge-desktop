import { describe, expect, it } from 'vitest'
import {
  needsDesktopOnboarding,
  resolvePostAuthRoute,
  resolveUnauthenticatedRoute,
} from './onboarding-gate'

describe('needsDesktopOnboarding', () => {
  it('is true when onboardingComplete is missing', () => {
    expect(needsDesktopOnboarding({ firstRun: true })).toBe(true)
    expect(needsDesktopOnboarding({ firstRun: false })).toBe(true)
  })

  it('is true when onboardingComplete is false', () => {
    expect(needsDesktopOnboarding({ firstRun: false, onboardingComplete: false })).toBe(true)
  })

  it('is false when onboardingComplete is true', () => {
    expect(needsDesktopOnboarding({ firstRun: false, onboardingComplete: true })).toBe(false)
  })
})

describe('resolvePostAuthRoute', () => {
  it('sends incomplete users to onboarding', () => {
    expect(resolvePostAuthRoute({ firstRun: true })).toBe('/onboarding')
  })

  it('sends complete users to dashboard', () => {
    expect(resolvePostAuthRoute({ firstRun: false, onboardingComplete: true })).toBe('/dashboard')
  })
})

describe('resolveUnauthenticatedRoute', () => {
  it('sends first-time / incomplete to onboarding', () => {
    expect(resolveUnauthenticatedRoute({ firstRun: true })).toBe('/onboarding')
  })

  it('sends returning complete users to login', () => {
    expect(resolveUnauthenticatedRoute({ firstRun: false, onboardingComplete: true })).toBe('/login')
  })
})
