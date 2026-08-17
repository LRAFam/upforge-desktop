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

  it('is true for a server-owned campaign even when device onboarding is complete', () => {
    expect(needsDesktopOnboarding(
      { firstRun: false, onboardingComplete: true },
      true,
    )).toBe(true)
  })
})

describe('resolvePostAuthRoute', () => {
  it('sends incomplete users to onboarding', () => {
    expect(resolvePostAuthRoute({ firstRun: true })).toBe('/onboarding')
  })

  it('sends complete users to dashboard', () => {
    expect(resolvePostAuthRoute({ firstRun: false, onboardingComplete: true })).toBe('/dashboard')
  })

  it('sends returning users into an account-owned campaign', () => {
    expect(resolvePostAuthRoute(
      { firstRun: false, onboardingComplete: true },
      true,
    )).toBe('/onboarding')
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
