/** Stepper state for the v3 onboarding rail (steps are 1-based, like OnboardingView). */
export type StepState = 'done' | 'current' | 'todo'

export interface RailStep { n: number; label: string; state: StepState }

export function railSteps(labels: readonly string[], step: number, initializing: boolean): RailStep[] {
  return labels.map((label, i) => {
    const n = i + 1
    const state: StepState = initializing ? 'todo' : n < step ? 'done' : n === step ? 'current' : 'todo'
    return { n, label, state }
  })
}

export function stepNumber(n: number): string {
  return String(n).padStart(2, '0')
}
