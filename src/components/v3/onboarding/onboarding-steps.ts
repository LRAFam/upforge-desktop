/** Stepper state for the v3 onboarding rail (steps are 1-based, like OnboardingView). */
export type StepState = 'done' | 'current' | 'todo'

/** `n` = the wizard's step number; `pos` = its place among the steps actually shown (what the counter prints). */
export interface RailStep { n: number; pos: number; label: string; state: StepState }

/**
 * Steps for the rail and the "01 / 05" counter. Steps the wizard jumped over because they were already
 * done (saved game, linked account) are left out, so the counter only counts what the player sees:
 * 01 / 03 → 02 / 03, never 01 / 05 → 04 / 05.
 */
export function railSteps(labels: readonly string[], step: number, initializing: boolean, skipped: readonly number[] = []): RailStep[] {
  return labels
    .map((label, i) => {
      const n = i + 1
      const state: StepState = initializing ? 'todo' : n < step ? 'done' : n === step ? 'current' : 'todo'
      return { n, label, state }
    })
    .filter(s => s.n === step || !skipped.includes(s.n))
    .map((s, i) => ({ ...s, pos: i + 1 }))
}

/**
 * Track skipped steps as the wizard moves. A forward jump (1 → 4) skips the steps in between;
 * landing on a step (e.g. "Change" goes back to 2) shows it again.
 */
export function nextSkipped(skipped: readonly number[], from: number, to: number): number[] {
  const out = new Set(skipped)
  for (let n = from + 1; n < to; n++) out.add(n)
  out.delete(to)
  return [...out].sort((a, b) => a - b)
}

export function stepNumber(n: number): string {
  return String(n).padStart(2, '0')
}
