/** Pure helpers for the v3 Coaches (getting coached) and Students (coaching others) screens. Not used by Squad. */

export { initial } from '../../../lib/name-initial'
import { rosterFormatDate } from '../../../lib/roster-match-display'
import { plural } from '../../../lib/plural'

/** 0–100, safe for missing or zero limits. */
export function limitPct(used: number | null | undefined, limit: number | null | undefined): number {
  if (!limit || limit <= 0 || used == null || used <= 0) return 0
  return Math.min(100, Math.round((used / limit) * 100))
}

/** "W–L" for a match row, or null when the score isn't known. */
export function roundScore(won: number | null | undefined, lost: number | null | undefined): string | null {
  if (won == null || lost == null) return null
  return `${won}–${lost}`
}

/** Result tone from rounds (or the won flag when rounds are missing). */
export function resultTone(row: { won?: boolean | null; rounds_won?: number | null; rounds_lost?: number | null }): 'win' | 'loss' | null {
  if (row.rounds_won != null && row.rounds_lost != null && row.rounds_won !== row.rounds_lost) {
    return row.rounds_won > row.rounds_lost ? 'win' : 'loss'
  }
  if (row.won === true) return 'win'
  if (row.won === false) return 'loss'
  return null
}

/**
 * Students page summary line: "2 students · free plan · 0 of 8 reviews used this month".
 * `roster_reviews_limit` is the whole roster's monthly cap on the free coach plan (config
 * coach_hub.limits.community = 8; Coach Pro has none). It is not the per-student allowance.
 */
export function studentsSummary(
  studentCount: number,
  mode: 'free' | 'paid',
  priceDollars: number,
  s: { roster_reviews_this_month?: number; roster_reviews_limit?: number | null } | null | undefined,
): string {
  const used = s?.roster_reviews_this_month ?? 0
  const limit = s?.roster_reviews_limit
  return [
    plural(studentCount, 'student'),
    mode === 'paid' ? `$${priceDollars} a month plan` : 'free plan',
    limit ? `${used} of ${limit} reviews used this month` : `${plural(used, 'review')} this month`,
  ].join(' · ')
}

/** Students H1: the one thing that matters now. */
export function studentsHeadline(queueCount: number): string {
  if (queueCount <= 0) return 'Queue is clear'
  return queueCount === 1 ? '1 match needs your notes' : `${queueCount} matches need your notes`
}

/** "Plan and price" summary: what students pay and get each month. */
export function settingsSummaryText(mode: 'free' | 'paid', priceDollars: number, includedReviews: number, needsSetup: boolean): string {
  const parts = [
    mode === 'paid' ? `Student plan: $${priceDollars} a month` : 'Student plan: free',
    `${includedReviews} ${includedReviews === 1 ? 'review' : 'reviews'} per student a month`,
  ]
  if (needsSetup) parts.push('needs setup')
  return parts.join(' · ')
}

/** Student row detail line (open reviews sit in their own column, so they are left out). */
export function rosterMemberLine(e: { membership_tier?: 'free' | 'paid' | null; games_analysed: number; last_active_at: string | null }): string {
  const parts = [`${e.games_analysed} analysed`]
  if (e.membership_tier === 'paid') parts.push('Paid plan')
  else if (e.membership_tier === 'free') parts.push('Free plan')
  if (e.last_active_at) parts.push(`active ${rosterFormatDate(e.last_active_at)}`)
  return parts.join(' · ')
}

// ---- Student side (Coaches): plain words, human coaches always by name ----

/** The one-line promise, shown once on the Coaches page. */
export const COACHES_PROMISE = 'Join a coach, send them your matches, and they write notes on your match timeline.'

export interface CoachLimits { active_reviews: number; active_reviews_limit: number; reviews_this_month: number; reviews_month_limit: number }

/** "Free plan" / "Paid plan" with a coach (the hub row has no price). */
export function planLabel(c: { membership_is_paid?: boolean; roster_membership_mode?: string | null }): string {
  return c.membership_is_paid || c.roster_membership_mode === 'paid' ? 'Paid plan' : 'Free plan'
}

/** One line instead of two limit bars: "1 match with astar now · 2 left this month". */
export function allowanceLine(name: string, limits: CoachLimits | null | undefined): string | null {
  if (!limits) return null
  const left = Math.max(0, (limits.reviews_month_limit ?? 0) - (limits.reviews_this_month ?? 0))
  const now = Math.max(0, limits.active_reviews ?? 0)
  return `${now > 0 ? `${plural(now, 'match', 'matches')} with ${name} now` : `Nothing with ${name} now`} · ${left} left this month`
}

/** Why a coach can't take a match right now, by name. `waitingMap` = the match they still have. */
export function blockedLine(name: string, code: string | null | undefined, reason?: string | null, waitingMap?: string | null): string {
  switch (code) {
    case 'student_active_limit':
      return waitingMap ? `You can send again when ${name} finishes ${waitingMap}.` : `You can send again when ${name} finishes your last match.`
    case 'student_monthly_limit':
      return `You’ve sent ${name} all your matches for this month. More next month.`
    case 'roster_closed':
    case 'roster_not_ready':
    case 'coach_pro_required':
      return `${name} isn’t taking matches right now.`
    case 'coach_monthly_limit':
      return `${name} is full for this month.`
    case 'membership_required':
      return `Rejoin ${name} on upforge.gg to send matches.`
    default:
      return reason?.trim() || `You can’t send a match to ${name} right now.`
  }
}

/** "astar has your Summit match" / "Crystalf1sh is reviewing Lotus". */
export function waitingPhrase(name: string, map: string, status: string): string {
  return status === 'in_progress' ? `${name} is reviewing ${map}` : `${name} has your ${map} match`
}

/**
 * Coaches H1 = the real state, in this order: notes ready › waiting for notes › something to send ›
 * plain "Your coaches". No coach yet → the promise as the headline.
 */
export function coachesHeadline(o: {
  coachCount: number
  unseenNotes: Array<{ coachName: string }>
  waiting: string[]
  canSend: boolean
  sendTo: string | null
}): { title: string; sub: string } {
  if (o.coachCount === 0) return { title: 'Get notes from a real coach', sub: COACHES_PROMISE }
  const waitingSub = o.waiting.length ? o.waiting.slice(0, 3).join(' · ') : null
  if (o.unseenNotes.length === 1) return { title: `${o.unseenNotes[0].coachName} left you notes`, sub: waitingSub ?? 'Open them below. They sit on your match timeline.' }
  if (o.unseenNotes.length > 1) return { title: `${o.unseenNotes.length} matches have new notes`, sub: waitingSub ?? 'Open them below. They sit on your match timeline.' }
  if (o.waiting.length) return { title: `${plural(o.waiting.length, 'match', 'matches')} waiting for notes`, sub: waitingSub ?? '' }
  if (o.canSend) return { title: `Send your last match to ${o.sendTo ?? 'a coach'}`, sub: COACHES_PROMISE }
  return { title: 'Your coaches', sub: COACHES_PROMISE }
}

/** Students: why the plan isn't live yet, in plain words (the fix link sits next to it). */
export function draftLine(fix: 'payouts' | 'pro' | null): string {
  if (fix === 'payouts') return 'Your paid plan goes live once payouts are set up on upforge.gg.'
  if (fix === 'pro') return 'A free plan needs Coach Pro. Turn it on, or switch to a paid plan.'
  return 'Almost live. Finish setup on upforge.gg.'
}

/**
 * Coaches › Send a match when no coach can take one: a single sentence. Coaches still busy with a
 * match share one "You can send again when …" clause; other reasons follow by name.
 */
export function sendBlockedText(rows: Array<{ name: string; code: string | null | undefined; reason?: string | null; waitingMap?: string | null }>): string {
  const busy = rows.filter(r => r.code === 'student_active_limit')
  const parts: string[] = []
  if (busy.length) {
    parts.push(`You can send again when ${busy.map(r => `${r.name} finishes ${r.waitingMap ?? 'your last match'}`).join(' or ')}.`)
  }
  for (const r of rows) if (r.code !== 'student_active_limit') parts.push(blockedLine(r.name, r.code, r.reason, r.waitingMap))
  return parts.join(' ')
}
