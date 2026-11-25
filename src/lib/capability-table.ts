/**
 * One table for every allowance on the account (Settings → Account): what's left, what uses it,
 * when it comes back and how to get more. Replaces separate paragraphs per unit, so the whole
 * picture is in one place. Rows only appear for allowances the API actually sent.
 */
import type { AccountUsage } from './account-usage'
import type { Allowance, CoachAllowances } from './coach-allowances'
import { cloudBytes } from './cloud-storage'
import { canBuyReports, showPurchasedReports } from '../components/v3/settings/settings-display'

export type CapabilityMore = 'buy_reports' | 'storage' | 'plans' | null

export interface CapabilityRow {
  id: string
  name: string
  /** "2 of 3 left", "No cap", "Included". */
  left: string
  /** True when nothing is left, so the cell can say so in words (not colour). */
  empty: boolean
  usedBy: string
  resets: string
  more: CapabilityMore
  moreLabel: string | null
}

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

function allowanceRow(id: string, name: string, usedBy: string, a: Allowance | null | undefined, period: string): CapabilityRow | null {
  if (!a || !a.enabled || a.limit <= 0) return null
  const resets = Number.isFinite(Date.parse(a.resets_at)) ? `${period} · next ${day(a.resets_at)}` : period
  return { id, name, left: `${a.remaining} of ${a.limit} left`, empty: a.remaining <= 0, usedBy, resets, more: 'plans', moreLabel: 'More on Plus or Pro' }
}

export function capabilityRows(usage: AccountUsage | null | undefined, coach: CoachAllowances | null | undefined): CapabilityRow[] {
  const rows: Array<CapabilityRow | null> = [
    allowanceRow('notes', 'Coach notes', 'One per match note from your coach', coach?.notes, 'Daily'),
    allowanceRow('key_moments', 'Key-moment reviews', 'One per key moment reviewed after a match', coach?.key_moments, 'Monthly'),
    allowanceRow('round_reviews', 'Round reviews', 'One per round you send for review', coach?.round_reviews, coach?.round_reviews?.period === 'week' ? 'Weekly' : 'Monthly'),
  ]
  if (usage) {
    const r = usage.reports
    const reportResets = r.limit === null ? 'No cap'
      : r.period === 'lifetime' ? "Lifetime, doesn't reset"
        : r.resets_at ? `Monthly · next ${day(r.resets_at)}`
          : r.reset_on_next_use ? 'Monthly · starts with your next report' : 'Monthly'
    rows.push({
      id: 'reports', name: 'Full-match AI reports',
      left: r.limit === null ? 'No cap' : `${r.remaining} of ${r.limit} left`,
      empty: r.limit !== null && r.remaining === 0,
      usedBy: 'One per full-match AI report', resets: reportResets,
      more: canBuyReports(r) ? 'buy_reports' : null, moreLabel: canBuyReports(r) ? 'Buy report credits' : null,
    })
    if (showPurchasedReports(r)) {
      rows.push({ id: 'purchased', name: 'Purchased report credits', left: `${r.purchased} left`, empty: r.purchased === 0, usedBy: 'Full-match reports, separate from your included ones', resets: "Don't expire", more: canBuyReports(r) ? 'buy_reports' : null, moreLabel: canBuyReports(r) ? 'Buy report credits' : null })
    }
    rows.push({ id: 'coach_credits', name: 'Coach Credits', left: `${usage.coach_credits} left`, empty: usage.coach_credits === 0, usedBy: 'Ask AI coach questions after a match\'s included ones', resets: 'Not a monthly allowance', more: null, moreLabel: 'Buy packs in Ask AI coach' })
    const c = usage.cloud_storage
    if (c) {
      const noCap = c.capacity_bytes === null
      rows.push({
        id: 'cloud', name: 'Cloud storage',
        left: noCap ? 'No cap' : `${cloudBytes(c.remaining_bytes ?? 0)} of ${cloudBytes(c.capacity_bytes ?? 0)} free`,
        empty: !noCap && c.remaining_bytes === 0,
        usedBy: 'Clips and recordings saved to the cloud', resets: "Doesn't reset; freed when files are removed",
        more: noCap ? null : 'storage', moreLabel: noCap ? null : 'Extra storage',
      })
    }
    const ra = usage.review_access
    if (ra) {
      const included = ra.comparison
      rows.push({
        id: 'comparisons', name: 'Match comparisons',
        left: ra.comparison_access_reason === 'free_trial' ? 'First one free' : included ? 'Included' : 'Not included',
        empty: !included && ra.comparison_access_reason !== 'free_trial',
        usedBy: 'Saving a comparison of two matches', resets: 'Saved comparisons stay readable',
        more: included ? null : 'plans', moreLabel: included ? null : 'Plus or Pro',
      })
    }
  }
  return rows.filter((r): r is CapabilityRow => r !== null)
}

