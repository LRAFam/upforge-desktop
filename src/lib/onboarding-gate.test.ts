import { describe, expect, it } from 'vitest'
import {
  resolveOnboardingCompletionRoute,
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

it('opens the requested first report after normal onboarding completion', () => {
  expect(resolveOnboardingCompletionRoute({ destination: 'analysis', recordingId: 'first-match' })).toEqual({ path: '/vod-review', query: { id: 'first-match' } })
  expect(resolveOnboardingCompletionRoute()).toEqual({ path: '/dashboard' })
})

describe('leaving an onboarding preview (UX1124-37)', () => {
  it('goes back to a safe in-app page only', async () => {
    const { previewReturnRoute } = await import('./onboarding-gate')
    expect(previewReturnRoute('/settings?tab=advanced')).toBe('/settings?tab=advanced')
    expect(previewReturnRoute('/dashboard')).toBe('/dashboard')
    expect(previewReturnRoute('//evil.example')).toBeNull()
    expect(previewReturnRoute('https://evil.example')).toBeNull()
    expect(previewReturnRoute('/onboarding?preview=1')).toBeNull()
    expect(previewReturnRoute(['/settings'])).toBeNull()
    expect(previewReturnRoute(undefined)).toBeNull()
  })

  it('every Preview onboarding button says where it came from, and the wizard uses it', async () => {
    const { readFileSync } = await import('fs')
    const { join } = await import('path')
    const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')
    expect(src('components/settings/SettingsAdvancedPane.vue')).toContain("from: '/settings?tab=advanced'")
    expect(src('App.vue')).toContain("query: { preview: '1', from: route.fullPath }")
    expect(src('components/dashboard/DashboardDevTools.vue').match(/preview: '1', from: \$route\.fullPath/g)?.length).toBe(2)
    expect(src('views/OnboardingView.vue')).toContain('previewReturnRoute(route.query.from)')
  })
})
