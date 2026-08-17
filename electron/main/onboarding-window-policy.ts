export function shouldMinimizeForDetectedGame(onboardingMissionActive: boolean): boolean {
  return !onboardingMissionActive
}

/** Onboarding owns post-match progress on its final screen, so it must not open a second window. */
export function shouldOpenPostGameWindow(
  onboardingMissionActive: boolean,
  deferForDemoSync: boolean,
): boolean {
  return !onboardingMissionActive && !deferForDemoSync
}
