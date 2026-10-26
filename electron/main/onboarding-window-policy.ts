export function shouldMinimizeForDetectedGame(
  onboardingMissionActive: boolean,
  onboardingPending = false,
  windowUrl = '',
): boolean {
  // A server campaign can reopen onboarding after local setup was completed.
  const onboardingVisible = windowUrl.split('#')[1]?.split('?')[0] === '/onboarding'
  return !onboardingMissionActive && !onboardingPending && !onboardingVisible
}

/** Onboarding owns post-match progress on its final screen, so it must not open a second window. */
export function shouldOpenPostGameWindow(
  onboardingMissionActive: boolean,
  deferForDemoSync: boolean,
): boolean {
  return !onboardingMissionActive && !deferForDemoSync
}
