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
  /**
   * Practice target hit in the trainer. The drill stays active until match evidence decides it.
   * Undefined on older APIs (there a trainer pass completed the drill instead).
   */
  practice_passed?: boolean
  practice_passed_at?: string | null
  /** Verified by match evidence (`verified_by`: match_stats | video_score; null = older record). */
  verified?: boolean
  verified_by?: string | null
}

export interface TrainerSyncOutcome {
  key: string
  clientRunId: string
  state: TrainerSyncState
  drill: TrainerDrillState | null
  /** false = still pending but the local copy could not be written (no automatic retry after a restart). */
  stored?: boolean
}

export interface TrainerSyncLine {
  text: string
  tone: 'win' | 'muted' | 'loss'
}

/** The signed-in account's trainer runs that have not reached the API (main process → `trainer:upload-status`). */
export interface TrainerUploadStatus {
  /** Kept on this computer and retried until they upload. */
  waiting: number
  /** Refused by the API, or not uploaded within a week, in the last week. A copy stays on this computer. */
  unsaved: number
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function asTrainerUploadStatus(raw: unknown): TrainerUploadStatus | null {
  const s = raw as Partial<TrainerUploadStatus> | null
  return s && typeof s.waiting === 'number' && typeof s.unsaved === 'number' ? { waiting: s.waiting, unsaved: s.unsaved } : null
}

/**
 * One line about this account's runs that have not reached UpForge, or null when there are none.
 * Pass `shown` on a screen that already reports one run (the result screen): that run is left out
 * of the counts and the rest are "other" runs.
 */
export function trainerUploadStatusLine(status: TrainerUploadStatus | null, shown?: TrainerSyncOutcome | null): TrainerSyncLine | null {
  if (!status) return null
  const other = shown !== undefined
  // A run on screen with no outcome yet is in its first upload, so it is counted as waiting.
  const waiting = Math.max(0, status.waiting - (other && (!shown || shown.state === 'pending') ? 1 : 0))
  const unsaved = Math.max(0, status.unsaved - (shown?.state === 'failed' ? 1 : 0))
  const runs = (n: number) => `${n} ${other ? 'other ' : ''}${n === 1 ? 'run' : 'runs'}`
  if (waiting && unsaved) return { text: `${runs(waiting)} waiting to upload. ${runs(unsaved)} from this week could not be saved.`, tone: 'loss' }
  if (waiting) return { text: `${runs(waiting)} waiting to upload. UpForge retries automatically.`, tone: 'muted' }
  if (unsaved) return { text: `${runs(unsaved)} from this week could not be saved.`, tone: 'loss' }
  return null
}

/** Short save state of one finished run in a list (e.g. each step of a guided session). */
export function trainerRunSavedLabel(outcome: TrainerSyncOutcome | null): TrainerSyncLine {
  if (!outcome) return { text: 'Saving…', tone: 'muted' }
  if (outcome.state === 'saved') return { text: 'Saved', tone: 'muted' }
  if (outcome.state === 'pending') return { text: 'Waiting to upload', tone: 'muted' }
  return { text: 'Not saved', tone: 'loss' }
}

/**
 * One line under the score: did this run count, and what happens to the drill next.
 * `scoreScale` matches how the screen shows scores (10 where scores read "/ 1000").
 */
export function trainerSyncLine(outcome: TrainerSyncOutcome | null, hasAssignedDrill: boolean, scoreScale = 1): TrainerSyncLine {
  const pass = (n: number) => String(n * scoreScale)
  if (!outcome) return { text: 'Saving this run…', tone: 'muted' }
  if (outcome.state === 'pending') {
    if (outcome.stored === false) {
      return { text: 'Not saved yet, and UpForge could not keep a copy on this computer. Keep the app open and online, and check free disk space.', tone: 'loss' }
    }
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
  if (d.practice_passed && d.status === 'active') {
    return { text: 'Recorded. Practice target hit: your next matches decide this drill.', tone: 'win' }
  }
  if (d.status === 'needs_reassignment') {
    const paused = `Recorded. ${d.attempt_count} runs below ${pass(d.pass_score)}, so this drill is paused.`
    // `next` on a paused drill is the same drill one step easier, already assigned (none below Easy, or an older API).
    if (d.next) {
      const tier = d.next.trainer_difficulty ? `${cap(d.next.trainer_difficulty)}, ` : ''
      return { text: `${paused} An easier version is ready: ${tier}pass at ${pass(d.next.pass_score)}.`, tone: 'muted' }
    }
    return { text: `${paused} Your next matches can assign a new one.`, tone: 'muted' }
  }
  const left = Math.max(0, d.attempts_allowed - d.attempt_count)
  return {
    text: `Recorded towards your drill: attempt ${d.attempt_count} of ${d.attempts_allowed}. Pass at ${pass(d.pass_score)}${left ? ` (${left} ${left === 1 ? 'try' : 'tries'} left)` : ''}.`,
    tone: 'muted',
  }
}
