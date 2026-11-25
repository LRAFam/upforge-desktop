/** Stepper state for the v3 onboarding rail (steps are 1-based, like OnboardingView). */
export type StepState = 'done' | 'current' | 'todo'

/**
 * `n` = the wizard's step number and `pos` = what the counter prints (the same: the list never changes
 * length). `alreadyDone` = the wizard jumped over it because it was done before (saved game, linked account).
 */
export interface RailStep { n: number; pos: number; label: string; state: StepState; alreadyDone: boolean }

/**
 * Steps for the rail and the "01 / 05" counter: a fixed checklist, so the total never changes partway
 * through. Steps the wizard jumped over are ticked and marked "Already done" (01 / 05 → 04 / 05).
 */
export function railSteps(labels: readonly string[], step: number, initializing: boolean, skipped: readonly number[] = []): RailStep[] {
  return labels.map((label, i) => {
    const n = i + 1
    const state: StepState = initializing ? 'todo' : n < step ? 'done' : n === step ? 'current' : 'todo'
    return { n, pos: n, label, state, alreadyDone: state === 'done' && skipped.includes(n) }
  })
}

/** "2 steps already done" next to the counter, or null. */
export function alreadyDoneNote(steps: readonly RailStep[]): string | null {
  const n = steps.filter(s => s.alreadyDone).length
  return n ? `${n} ${n === 1 ? 'step' : 'steps'} already done` : null
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
