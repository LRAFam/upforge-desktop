export type OnboardingStep = 1 | 2 | 3 | 4 | 5

/** Ask only for information that the player's account does not already supply. */
export function resolveOnboardingStep(input: {
  authenticated: boolean
  hasSavedGame: boolean
  accountLinked: boolean
  activeMission: boolean
}): OnboardingStep {
  if (!input.authenticated) return 1
  if (input.activeMission) return 5
  if (!input.hasSavedGame) return 2
  return input.accountLinked ? 4 : 3
}
