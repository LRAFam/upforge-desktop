/** Setup is incomplete unless onboardingComplete === true. */
export function needsDesktopOnboarding(settings: {
  firstRun?: boolean
  onboardingComplete?: boolean
}, campaignRequiresOnboarding = false): boolean {
  return campaignRequiresOnboarding || settings.onboardingComplete !== true
}

/** After successful login. */
export function resolvePostAuthRoute(settings: {
  firstRun?: boolean
  onboardingComplete?: boolean
}, campaignRequiresOnboarding = false): '/onboarding' | '/dashboard' {
  return needsDesktopOnboarding(settings, campaignRequiresOnboarding) ? '/onboarding' : '/dashboard'
}

/**
 * Not logged in.
 * - Incomplete setup → onboarding (includes sign-in step)
 * - Setup already done → classic login
 */
export function resolveUnauthenticatedRoute(settings: {
  firstRun?: boolean
  onboardingComplete?: boolean
}): '/onboarding' | '/login' {
  return needsDesktopOnboarding(settings) ? '/onboarding' : '/login'
}

/** The first-report action must behave the same for real users and previews. */
export function resolveOnboardingCompletionRoute(options?: { destination?: 'dashboard' | 'analysis'; recordingId?: string }) {
  return options?.destination === 'analysis' && options.recordingId
    ? { path: '/vod-review', query: { id: options.recordingId } }
    : { path: '/dashboard' }
}

/**
 * Where leaving an onboarding preview goes: back to the in-app page that opened it (`?from=`, e.g.
 * "/settings?tab=advanced"), or null when there's no safe one. Only app paths, never onboarding itself.
 */
export function previewReturnRoute(from: unknown): string | null {
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//') || from.length > 300) return null
  if (from === '/onboarding' || from.startsWith('/onboarding?') || from.startsWith('/onboarding/')) return null
  return from
}
