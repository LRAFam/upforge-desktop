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
  /** Last locally synced report, restored by the main process for this account. */
  latest?: FocusUpdate | null
}

export interface NoteClaim { finding_id: string; text: string; rounds?: number[] }

export interface FocusUpdate {
  match_id: string
  focus: Focus | null
  focus_event: 'created' | 'checked' | 'achieved' | 'missed' | null
  /** Last observed focus before a rotation; its status is not inferred. */
  previous_focus?: Focus | null
  report?: {
    notes?: { headline?: NoteClaim; subline?: NoteClaim; next_action?: NoteClaim; positive?: NoteClaim | null } | null
    notes_source?: string
  } | null
}

export interface FocusSyncResult {
  ok: boolean
  uploaded: number
  skipped: number
  reason?: string
  latest: FocusUpdate | null
}

/** Never pair cached notes with a different focus or a newer check from another device. */
export function hydrateFocusResponse(data: FocusResponse, latest: FocusUpdate | null): FocusResponse {
  const focus = data.focus
  const lastCheck = focus?.checks.at(-1)
  const matches = !!focus && !!latest?.focus && focus.id === latest.focus.id
    && (lastCheck ? lastCheck.match_id === latest.match_id : latest.focus.checks.length === 0)
  return { ...data, latest: matches ? { ...latest!, focus } : null }
}

export function focusTransitionText(update: FocusUpdate | null | undefined): string {
  const previous = update?.previous_focus
  if (!previous || !update?.focus || previous.id === update.focus.id) return ''
  const title = `${previous.label} ${previous.better === 'lower' ? 'under' : 'over'} ${pct(previous.target)}`
  if (previous.progress.status === 'achieved') return `You achieved your previous focus: ${title}. This is your next focus.`
  if (previous.progress.status === 'missed') return `Your previous focus ended without reaching its target: ${title}. This is your next focus.`
  return `Your focus changed from ${title} after a new match.`
}

export function focusSyncMessage(result: FocusSyncResult | null): string {
  if (!result || result.reason === 'sign_in_required') return 'Sign in to check your matches.'
  if (result.reason === 'sync_in_progress') return 'Your matches are already being checked.'
  if (result.reason === 'not_your_match') return 'The Riot account in Valorant does not match the account linked to UpForge.'
  if (result.reason === 'http_502') return 'The AI service is temporarily unavailable. Your match will be retried on the next check.'
  if (result.reason === 'network_error') return 'Could not reach UpForge. Your match will be retried on the next check.'
  if (result.reason?.startsWith('http_')) return 'UpForge could not process your match. It will be retried on the next check.'
  if (result.reason === 'invalid_match') return 'Some matches could not be processed because their match data was incomplete or rejected.'
  if (result.reason === 'riot_client_unavailable' || result.reason === 'fetch_failed') return 'Open Valorant (the Riot Client) so UpForge can read your recent matches.'
  if (result.reason === 'no_recent_matches') return 'No recent Valorant matches were found.'
  if (result.reason === 'some_matches_failed' || result.reason === 'match_history_unavailable') return 'Riot match details are not available yet. Please try again shortly.'
  if (!result.ok) return 'Could not check your matches. Please try again.'
  if (result.uploaded === 0) return "You're up to date."
  return `Checked ${result.uploaded} new match${result.uploaded === 1 ? '' : 'es'}.`
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
