/**
 * Pure helpers for the coach side of Rosters. Shared by the old panel and the v3 view through
 * `useCoachRoster`. Texts and rules are moved here unchanged from RostersCoachPanel.vue.
 */
import { rosterFormatDate, type RosterMatchVisual } from '../../lib/roster-match-display'

export type RosterSettings = {
  roster_enabled?: boolean
  roster_is_live?: boolean
  roster_requires_pro?: boolean
  has_active_coach_pro?: boolean
  roster_connect_ready?: boolean
  roster_welcome_message?: string | null
  roster_membership_mode?: 'free' | 'paid'
  roster_membership_price_cents?: number | null
  roster_included_reviews_per_month?: number
  roster_membership_min_price_cents?: number
  roster_member_count?: number
  roster_member_limit?: number | null
  roster_reviews_this_month?: number
  roster_reviews_limit?: number | null
  coach_hub_billing_enabled?: boolean
  pro_price_cents?: number
}

export type RosterStudent = {
  student: {
    id: number
    name: string
    riot_name: string | null
    riot_tag: string | null
  }
  games_analysed: number
  open_review_count: number
  joined_at: string | null
  last_active_at: string | null
  top_coaching_tags_30d?: string[]
}

export type CoachReview = {
  id: number
  status: string
  student_question?: string | null
  requested_at?: string | null
  analysis_id?: number | null
  user?: { id: number; name: string } | null
  analysis?: (RosterMatchVisual & { id?: number }) | null
}

export type MembershipMode = 'free' | 'paid'
export type RosterStatus = 'Live' | 'Draft' | 'Closed'
/** Which web link fixes a Draft roster, if any. */
export type DraftFix = 'payouts' | 'pro' | null

export function rosterStatus(s: RosterSettings | null | undefined): RosterStatus {
  if (!s?.roster_enabled) return 'Closed'
  if (s.roster_is_live) return 'Live'
  return 'Draft'
}

export function rosterDraftReason(s: RosterSettings | null | undefined, mode: MembershipMode): string | null {
  if (!s?.roster_enabled || s.roster_is_live) return null
  if (mode === 'paid' && !s.roster_connect_ready) {
    return 'Paid community stays Draft until Stripe payouts are set up on the web.'
  }
  if (mode === 'free' && s.roster_requires_pro && !s.has_active_coach_pro) {
    return 'Free community stays Draft until Coach Pro is active, or switch to paid.'
  }
  return 'Roster is enabled but not live yet. Finish setup on the web if needed.'
}

/** Mirrors the old panel's two link conditions (only shown alongside a draft reason). */
export function rosterDraftFix(s: RosterSettings | null | undefined, mode: MembershipMode): DraftFix {
  if (!s) return null
  if (mode === 'paid' && !s.roster_connect_ready) return 'payouts'
  if (mode === 'free' && s.roster_requires_pro && !s.has_active_coach_pro) return 'pro'
  return null
}

export function rosterForm(s: RosterSettings): { welcome: string; mode: MembershipMode; priceDollars: number; includedReviews: number } {
  const cents = s.roster_membership_price_cents ?? 999
  return {
    welcome: s.roster_welcome_message ?? '',
    mode: s.roster_membership_mode === 'free' ? 'free' : 'paid',
    priceDollars: Math.round(cents) / 100,
    includedReviews: s.roster_included_reviews_per_month ?? 3,
  }
}

export function normalizeQueue(queue: unknown[] | null | undefined): CoachReview[] {
  return (queue ?? []).map((r) => {
    const row = r as CoachReview
    const analysisId = row.analysis_id ?? row.analysis?.id ?? null
    return { ...row, analysis_id: analysisId }
  })
}

export function openQueueCount(reviews: CoachReview[]): number {
  return reviews.filter(r => r.status === 'pending' || r.status === 'in_progress').length
}

export function studentSubtitle(entry: RosterStudent): string {
  const parts = [`${entry.games_analysed} analysed`]
  if (entry.open_review_count > 0) parts.push(`${entry.open_review_count} open`)
  if (entry.last_active_at) parts.push(`active ${rosterFormatDate(entry.last_active_at)}`)
  return parts.join(' · ')
}

export function coachReviewSubtitle(review: CoachReview): string {
  const parts = [
    review.user?.name || 'Student',
    review.status === 'in_progress' ? 'In progress' : 'Pending',
  ]
  if (review.requested_at) parts.push(rosterFormatDate(review.requested_at))
  return parts.join(' · ')
}

export function riotId(entry: RosterStudent): string | null {
  return entry.student.riot_name ? `${entry.student.riot_name}#${entry.student.riot_tag}` : null
}
