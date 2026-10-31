/** Coaching allowances and live key-moment results (shapes from the API). */
export interface Allowance { enabled: boolean; used: number; limit: number; remaining: number; resets_at: string; period?: 'week' | 'month' }

export interface CoachAllowances {
  tier: 'free' | 'premium' | 'pro' | 'admin'
  match_report: { enabled: boolean }
  starting_report: { enabled: boolean }
  notes: Allowance
  key_moments: Allowance
  round_reviews: Allowance
}

export interface LiveMoment {
  id: number
  match_id: string
  round_number: number
  window_start_ms: number
  window_end_ms: number
  kind: string | null
  status: 'queued' | 'processing' | 'completed' | 'hidden' | 'failed'
  story: string | null
  fixes: Array<{ title?: string; detail?: string; evidence_ms?: number } | string>
  refunded: boolean
}

export interface LiveUpdate {
  matchId: string
  state: 'planning' | 'cutting' | 'uploading' | 'reviewing' | 'done' | 'skipped' | 'error'
  reason?: string
  moments: LiveMoment[]
  found: number
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

function resetLabel(iso: string, now = new Date()): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'soon'
  const days = Math.ceil((d.getTime() - now.getTime()) / 86_400_000)
  if (days <= 1) return 'tomorrow'
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/** "2 of 3 coach notes left today" / "Today's coach notes are used. They return tomorrow." */
export function notesLine(a: Allowance | null | undefined, now = new Date()): string | null {
  if (!a || !a.enabled || a.limit <= 0) return null
  if (a.remaining <= 0) return `Today's coach notes are used. They return ${resetLabel(a.resets_at, now)}.`
  return `${a.remaining} of ${plural(a.limit, 'coach note')} left today`
}

/** "3 of 4 key-moment reviews left this month" / "...used. They reset on 1 Dec." */
export function momentsLine(a: Allowance | null | undefined, now = new Date()): string | null {
  if (!a || !a.enabled || a.limit <= 0) return null
  if (a.remaining <= 0) return `This month's key-moment reviews are used. They reset on ${resetLabel(a.resets_at, now)}.`
  return `${a.remaining} of ${plural(a.limit, 'key-moment review')} left this month`
}

export function roundReviewsLine(a: Allowance | null | undefined, now = new Date()): string | null {
  if (!a || !a.enabled || a.limit <= 0) return null
  const per = a.period === 'week' ? 'this week' : 'this month'
  if (a.remaining <= 0) return `Round reviews used ${per}. They reset on ${resetLabel(a.resets_at, now)}.`
  return `${a.remaining} of ${plural(a.limit, 'round review')} left ${per}`
}

/** Post-game line: "Your coach found 2 things" once at least one moment is coached. */
export function foundLine(u: Pick<LiveUpdate, 'state' | 'found'> | null | undefined): string | null {
  if (!u) return null
  if (u.found > 0) return `Your coach found ${plural(u.found, 'thing')}`
  if (u.state === 'planning' || u.state === 'cutting' || u.state === 'uploading' || u.state === 'reviewing') return 'Your coach is watching the key moments…'
  return null
}
