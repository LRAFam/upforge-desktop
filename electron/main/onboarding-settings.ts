export function migrateOnboardingFlags<T extends {
  firstRun?: boolean
  onboardingComplete?: boolean
}>(parsed: T): T {
  const next = { ...parsed }
  if (next.firstRun === false && next.onboardingComplete === undefined) {
    next.onboardingComplete = true
  }
  return next
}

export function withOnboardingComplete<T extends {
  firstRun?: boolean
  onboardingComplete?: boolean
}>(partial: T): T {
  if (partial.onboardingComplete === true) {
    return { ...partial, firstRun: false }
  }
  return partial
}
