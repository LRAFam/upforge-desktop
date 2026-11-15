/**
 * Upload state of a finished trainer run and what it did to the assigned drill, as plain copy for the
 * result screens. Shared with electron/main/trainer-session-queue.ts (types only there).
 */
export type TrainerSyncState = 'saved' | 'pending' | 'failed'

/** What the API said about the assigned drill (POST /api/training/sessions → `drill`). */
export interface TrainerDrillState {
  id: number
  title: string | null
  status: string
  completed: boolean
  attempt_count: number
  attempts_allowed: number
  pass_score: number
  next: { id: number; title: string | null; trainer_difficulty: string | null; pass_score: number } | null
}

export interface TrainerSyncOutcome {
  key: string
  clientRunId: string
  state: TrainerSyncState
  drill: TrainerDrillState | null
}

export interface TrainerSyncLine {
  text: string
  tone: 'win' | 'muted' | 'loss'
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * One line under the score: did this run count, and what happens to the drill next.
 * `scoreScale` matches how the screen shows scores (10 where scores read "/ 1000").
 */
export function trainerSyncLine(outcome: TrainerSyncOutcome | null, hasAssignedDrill: boolean, scoreScale = 1): TrainerSyncLine {
  const pass = (n: number) => String(n * scoreScale)
  if (!outcome) return { text: 'Saving this run…', tone: 'muted' }
  if (outcome.state === 'pending') {
    return { text: 'Not saved yet. UpForge keeps this run and retries automatically.', tone: 'muted' }
  }
  if (outcome.state === 'failed') {
    return { text: hasAssignedDrill ? 'This run could not be saved, so it did not count towards your drill.' : 'This run could not be saved.', tone: 'loss' }
  }
  const d = outcome.drill
  if (!d) {
    return { text: hasAssignedDrill ? 'Saved to your training history. It did not count towards a drill.' : 'Saved to your training history.', tone: 'muted' }
  }
  if (d.completed) {
    if (d.next) {
      const tier = d.next.trainer_difficulty ? cap(d.next.trainer_difficulty) : 'the next tier'
      return { text: `Drill passed and recorded. Next: ${tier}, pass at ${pass(d.next.pass_score)}.`, tone: 'win' }
    }
    return { text: 'Drill passed and recorded. That was the last tier.', tone: 'win' }
  }
  if (d.status === 'needs_reassignment') {
    return { text: `Recorded. ${d.attempt_count} runs below ${pass(d.pass_score)}, so this drill is closed; your next matches can assign a new one.`, tone: 'muted' }
  }
  const left = Math.max(0, d.attempts_allowed - d.attempt_count)
  return {
    text: `Recorded towards your drill: attempt ${d.attempt_count} of ${d.attempts_allowed}. Pass at ${pass(d.pass_score)}${left ? ` (${left} ${left === 1 ? 'try' : 'tries'} left)` : ''}.`,
    tone: 'muted',
  }
}
