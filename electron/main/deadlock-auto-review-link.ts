/**
 * Links a cloud review that the match-end auto-upload started to this match's Deadlock recording(s),
 * so "Review replay" isn't offered again (it would charge a second credit for the same match).
 */
export interface LinkableRecording {
  id: string
  game: string
  recordedAt: number
  matchId?: string | null
  deadlockReviewJobId?: string
}

/** Recordings are saved with recordedAt = match session start; allow for clock skew between the two paths. */
const SESSION_WINDOW_MS = 10 * 60 * 1000

export function recordingsForDeadlockMatch<T extends LinkableRecording>(
  recordings: readonly T[],
  match: { matchId?: number | string | null; sessionStart?: number | null },
): T[] {
  const id = match.matchId != null ? String(match.matchId) : null
  const deadlock = recordings.filter(r => r.game === 'deadlock' && !r.deadlockReviewJobId)
  if (id) {
    const byId = deadlock.filter(r => r.matchId === id)
    if (byId.length) return byId
  }
  const start = match.sessionStart
  if (start == null || !Number.isFinite(start)) return []
  return deadlock.filter(r => !r.matchId || r.matchId === id).filter(r => Math.abs(r.recordedAt - start) <= SESSION_WINDOW_MS)
}

/** Returns how many recordings were linked. */
export function linkDeadlockAutoReview<T extends LinkableRecording>(
  store: { list: () => readonly T[]; setJob: (recordingId: string, jobId: string) => boolean },
  jobId: string,
  match: { matchId?: number | string | null; sessionStart?: number | null },
): number {
  let n = 0
  for (const rec of recordingsForDeadlockMatch(store.list(), match)) {
    if (store.setJob(rec.id, jobId)) n++
  }
  return n
}
