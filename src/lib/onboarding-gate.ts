/** Setup is incomplete unless onboardingComplete === true. */
export function needsDesktopOnboarding(settings: {
  firstRun?: boolean
  onboardingComplete?: boolean
}): boolean {
  return settings.onboardingComplete !== true
}

/** After successful login. */
export function resolvePostAuthRoute(settings: {
  firstRun?: boolean
  onboardingComplete?: boolean
}): '/onboarding' | '/dashboard' {
  return needsDesktopOnboarding(settings) ? '/onboarding' : '/dashboard'
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
