/**
 * Which line the match report shows under its headline about the coach note.
 * "No coach note" is only for a finished answer with no note: never while notes are loading
 * (or still being written by the API), and never after the call failed (that gets a retry).
 */
export type CoachNoteLine = 'recurrence' | 'capped' | 'loading' | 'failed' | 'none' | null

export function coachNoteLine(s: {
  hasCoachNote: boolean
  recurrence: boolean
  notesCapped: boolean
  waiting: boolean
  failed: boolean
}): CoachNoteLine {
  if (s.recurrence) return 'recurrence'
  if (s.notesCapped) return 'capped'
  if (s.hasCoachNote) return null
  if (s.waiting) return 'loading'
  if (s.failed) return 'failed'
  return 'none'
}
