/**
 * Pure helpers for the v3 Coaching reviews screen. Everything here formats data the
 * coaching-history composable already loads — nothing is invented.
 */
import type { MatchRowStats } from '../../../lib/dashboard-match-row'
import type { PendingMatchLifecycleState } from '../../../lib/match-lifecycle'

export type ResultTone = 'win' | 'loss' | 'none'

interface ResultLike {
  won: boolean | number | null | undefined
  rounds_won: number | null | undefined
  rounds_lost: number | null | undefined
}

export function resultTone(r: ResultLike): ResultTone {
  if (r.won === true || r.won === 1) return 'win'
  if (r.won === false || r.won === 0) return 'loss'
  return 'none'
}

/** "13–9" when both sides are known, else '' (never a guessed score). */
export function scoreLine(r: ResultLike): string {
  return r.rounds_won != null && r.rounds_lost != null ? `${r.rounds_won}–${r.rounds_lost}` : ''
}

/** Result word for the D4 slot: WIN / LOSS, or '' when unknown. */
export function resultWord(r: ResultLike): string {
  const t = resultTone(r)
  return t === 'win' ? 'WIN' : t === 'loss' ? 'LOSS' : ''
}

export function kdaLine(r: { kills: number | null | undefined; deaths: number | null | undefined; assists: number | null | undefined }): string {
  if (r.kills == null) return ''
  return `${r.kills}/${r.deaths ?? 0}/${r.assists ?? 0}`
}

/** Status of a coached session in the list: what the player can expect when opening it. */
export function sessionStatusLabel(status: string, coachReviewStatus?: string | null): string {
  if (['queued', 'processing', 'pending'].includes(status)) return 'Coaching in progress'
  if (status === 'failed') return 'Coaching failed'
  if (coachReviewStatus === 'completed') return 'Coach notes ready'
  if (coachReviewStatus === 'in_progress') return 'With your coach'
  return 'Reviewed'
}

/** Dot colour for a match waiting for coaching. Red = needs you (the one action), live = moving, faint = waiting. */
export function pendingDot(state: PendingMatchLifecycleState): { color: string; live: boolean } {
  if (state === 'action_required') return { color: 'var(--uf-red)', live: false }
  if (state === 'uploading' || state === 'analysing') return { color: 'var(--uf-bone)', live: true }
  return { color: 'var(--uf-faint)', live: false }
}

/** Inline stat items for a header line (only the ones that exist). */
export function statItems(s: Pick<MatchRowStats, 'kills' | 'deaths' | 'assists' | 'combat_score' | 'hs_pct'> & { acs?: number | null }): Array<{ value: string; label: string }> {
  const out: Array<{ value: string; label: string }> = []
  const kda = kdaLine(s)
  if (kda) out.push({ value: kda, label: 'K/D/A' })
  const acs = s.acs ?? s.combat_score
  if (acs != null) out.push({ value: String(acs), label: 'ACS' })
  if (s.hs_pct != null) out.push({ value: `${s.hs_pct}%`, label: 'headshots' })
  return out
}
