/** Focus loop types and display helpers (data from GET /api/focus and POST /api/match-report). */

export interface FocusCheck {
  match_id: string
  value: number
  hit: boolean
  played_at: string | null
}

export interface Focus {
  id: number
  metric: string
  label: string
  better: 'lower' | 'higher'
  baseline: number
  target: number
  checks: FocusCheck[]
  progress: { games_played: number; hits: number; games_required: number; hits_required: number; status: string }
  started_at: string | null
  completed_at: string | null
}

export interface FocusResponse {
  success: boolean
  focus: Focus | null
  history: Array<{ match_id: string; played_at: string | null; metrics: Record<string, number | null> }>
  notes_usage: { used: number; limit: number }
}

export interface NoteClaim { finding_id: string; text: string; rounds?: number[] }

export interface FocusUpdate {
  match_id: string
  focus: Focus | null
  focus_event: 'created' | 'checked' | 'achieved' | 'missed' | null
  report?: {
    notes?: { headline?: NoteClaim; subline?: NoteClaim; next_action?: NoteClaim; positive?: NoteClaim | null } | null
    notes_source?: string
  } | null
}

export const pct = (v: number | null | undefined): string => (v == null ? '—' : `${Math.round(v * 100)}%`)

/** Slots for the focus window: hit / miss / pending, in play order. */
export function focusSlots(focus: Focus): Array<'hit' | 'miss' | 'pending'> {
  const played: Array<'hit' | 'miss'> = focus.checks.map(c => (c.hit ? 'hit' : 'miss'))
  const pending = Math.max(0, focus.progress.games_required - played.length)
  return [...played, ...Array<'pending'>(pending).fill('pending')]
}

export function focusHeadline(focus: Focus): string {
  const goal = `${focus.better === 'lower' ? 'under' : 'over'} ${pct(focus.target)}`
  switch (focus.progress.status) {
    case 'achieved': return `Focus achieved: ${focus.label.toLowerCase()} ${goal}`
    case 'missed': return `Not this time: ${focus.label.toLowerCase()} ${goal}`
    default: return `${focus.label} ${goal}`
  }
}

export function focusSubline(focus: Focus): string {
  const p = focus.progress
  if (p.status === 'achieved') return `Hit in ${p.hits} of ${p.games_played} games. Your next focus starts after your next match.`
  if (p.status === 'missed') return `Hit in ${p.hits} of ${p.games_played} games. A new focus starts after your next match.`
  const left = p.hits_required - p.hits
  return `Started at ${pct(focus.baseline)}. Hit it in ${left} more of your next ${p.games_required - p.games_played} game${p.games_required - p.games_played === 1 ? '' : 's'}.`
}
