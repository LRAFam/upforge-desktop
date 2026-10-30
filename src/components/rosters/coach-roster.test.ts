import { describe, expect, it } from 'vitest'
import {
  coachReviewSubtitle,
  normalizeQueue,
  openQueueCount,
  riotId,
  rosterDraftFix,
  rosterDraftReason,
  rosterForm,
  rosterStatus,
  studentSubtitle,
  type RosterStudent,
} from './coach-roster'

describe('coach roster helpers', () => {
  it('status: closed, draft, live', () => {
    expect(rosterStatus(null)).toBe('Closed')
    expect(rosterStatus({ roster_enabled: false, roster_is_live: true })).toBe('Closed')
    expect(rosterStatus({ roster_enabled: true })).toBe('Draft')
    expect(rosterStatus({ roster_enabled: true, roster_is_live: true })).toBe('Live')
  })

  it('draft reason and the one fix link', () => {
    const paid = { roster_enabled: true, roster_connect_ready: false }
    expect(rosterDraftReason(paid, 'paid')).toMatch(/Stripe payouts/)
    expect(rosterDraftFix(paid, 'paid')).toBe('payouts')
    const free = { roster_enabled: true, roster_requires_pro: true, has_active_coach_pro: false, roster_connect_ready: true }
    expect(rosterDraftReason(free, 'free')).toMatch(/Coach Pro/)
    expect(rosterDraftFix(free, 'free')).toBe('pro')
    expect(rosterDraftReason({ roster_enabled: true, roster_connect_ready: true }, 'paid')).toMatch(/not live yet/)
    expect(rosterDraftFix({ roster_enabled: true, roster_connect_ready: true }, 'paid')).toBeNull()
    expect(rosterDraftReason({ roster_enabled: true, roster_is_live: true }, 'paid')).toBeNull()
    expect(rosterDraftReason({ roster_enabled: false }, 'paid')).toBeNull()
  })

  it('form defaults match the old panel', () => {
    expect(rosterForm({})).toEqual({ welcome: '', mode: 'paid', priceDollars: 9.99, includedReviews: 3 })
    expect(rosterForm({ roster_membership_mode: 'free', roster_membership_price_cents: 1500, roster_included_reviews_per_month: 5, roster_welcome_message: 'hi' }))
      .toEqual({ welcome: 'hi', mode: 'free', priceDollars: 15, includedReviews: 5 })
  })

  it('queue: analysis id fallback and open count', () => {
    const q = normalizeQueue([
      { id: 1, status: 'pending', analysis: { id: 9 } },
      { id: 2, status: 'in_progress', analysis_id: 4 },
      { id: 3, status: 'completed' },
    ])
    expect(q.map(r => r.analysis_id)).toEqual([9, 4, null])
    expect(openQueueCount(q)).toBe(2)
    expect(normalizeQueue(null)).toEqual([])
  })

  it('subtitles and riot id', () => {
    const entry: RosterStudent = { student: { id: 1, name: 'Ana', riot_name: 'ana', riot_tag: 'EUW' }, games_analysed: 4, open_review_count: 2, joined_at: null, last_active_at: null }
    expect(studentSubtitle(entry)).toBe('4 analysed · 2 open')
    expect(riotId(entry)).toBe('ana#EUW')
    expect(riotId({ ...entry, student: { ...entry.student, riot_name: null } })).toBeNull()
    expect(coachReviewSubtitle({ id: 1, status: 'in_progress', user: { id: 2, name: 'Bo' } })).toBe('Bo · In progress')
    expect(coachReviewSubtitle({ id: 1, status: 'pending' })).toBe('Student · Pending')
  })
})
