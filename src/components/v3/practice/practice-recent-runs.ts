/**
 * Practice → Analytics → "Recent runs": the player's own last runs, each with "Remove".
 * Remove is always confirmed first (it can't be undone) and calls DELETE /api/training/sessions/{id}
 * through `trainer:remove-run`. Drills and XP stay as the API leaves them.
 */
export const REMOVE_RUN_TITLE = 'Remove this run?'
export const REMOVE_RUN_BODY = 'It’s deleted from your history, bests and leaderboards. This can’t be undone.'

export interface RecentRunInput {
  id: number
  scenario: string
  score: number
  accuracy_pct: number
  completed_at: string
}

export interface RecentRunRow {
  id: number
  scenario: string
  label: string
  score: number
  accuracy: string
  when: string
}

function shortDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/** Newest first, runs already removed this visit left out, at most `limit` rows. */
export function recentRunRows(
  sessions: readonly RecentRunInput[] | null | undefined,
  labelFor: (scenario: string) => string,
  removed: ReadonlySet<number> = new Set(),
  limit = 10,
): RecentRunRow[] {
  return [...(sessions ?? [])]
    .filter(s => Number.isInteger(s.id) && s.id > 0 && !removed.has(s.id))
    .sort((a, b) => Date.parse(b.completed_at) - Date.parse(a.completed_at))
    .slice(0, limit)
    .map(s => ({
      id: s.id,
      scenario: s.scenario,
      label: labelFor(s.scenario),
      score: Math.round(Number(s.score)),
      accuracy: `${Math.round(Number(s.accuracy_pct))}%`,
      when: shortDate(s.completed_at),
    }))
}
