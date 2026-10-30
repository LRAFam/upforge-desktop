import { describe, expect, it } from 'vitest'
import {
  filterCoaches, groupSessions, ratingLabel, rateLabel, sortCoaches, toMarketCoach, toMarketCoachDetail,
  toMarketSession, toPaidReview, toReviewOffer,
} from './marketplace'

const raw = (over: Record<string, unknown> = {}) => ({
  id: 7, display_name: 'Nova', hourly_rate: '25.00', average_rating: 4.84, total_reviews: 12, total_sessions: 40,
  games: ['valorant'], roles: ['Controller'], specialties: ['Comms'], languages: ['English'], ...over,
})

describe('toMarketCoach', () => {
  it('keeps only real fields and parses string rates', () => {
    const c = toMarketCoach(raw())!
    expect(c.hourlyRate).toBe(25)
    expect(c.rating).toBeCloseTo(4.84)
    expect(rateLabel(c)).toBe('$25 / hour')
    expect(ratingLabel(c)).toBe('4.8 · 12 reviews')
  })
  it('never shows a rating without reviews', () => {
    const c = toMarketCoach(raw({ average_rating: 5, total_reviews: 0 }))!
    expect(c.rating).toBeNull()
    expect(ratingLabel(c)).toBe('No reviews yet')
  })
  it('uses the singular for one review', () => {
    expect(ratingLabel(toMarketCoach(raw({ total_reviews: 1 }))!)).toBe('4.8 · 1 review')
  })
  it('rejects rows without an id or name', () => {
    expect(toMarketCoach({ display_name: 'x' })).toBeNull()
    expect(toMarketCoach({ id: 3 })).toBeNull()
    expect(toMarketCoach(null)).toBeNull()
  })
})

describe('sorting and filtering', () => {
  const list = [toMarketCoach(raw())!, toMarketCoach(raw({ id: 8, display_name: 'Ash', hourly_rate: 10, average_rating: 4.2, total_sessions: 90, roles: ['Duelist'] }))!]
  it('sorts by rating, price and sessions', () => {
    expect(sortCoaches(list, 'rating').map(c => c.id)).toEqual([7, 8])
    expect(sortCoaches(list, 'price').map(c => c.id)).toEqual([8, 7])
    expect(sortCoaches(list, 'sessions').map(c => c.id)).toEqual([8, 7])
  })
  it('filters by role and max rate', () => {
    expect(filterCoaches(list, { role: 'duelist' }).map(c => c.id)).toEqual([8])
    expect(filterCoaches(list, { maxRate: 15 }).map(c => c.id)).toEqual([8])
  })
})

describe('profile detail', () => {
  it('reads the next slot and reviews', () => {
    const d = toMarketCoachDetail(raw({
      accepting_students: true,
      next_available_slot: { start_time: '2026-11-02T18:00:00Z', end_time: '2026-11-02T19:00:00Z' },
      reviews: [{ id: 1, rating: 5, review_text: 'Great', student_name: 'Sam', reviewed_at: '2026-10-01T00:00:00Z' }, { bad: true }],
    }))!
    expect(d.nextSlot?.end).toBeGreaterThan(d.nextSlot!.start)
    expect(d.reviews).toHaveLength(1)
    expect(d.acceptingStudents).toBe(true)
  })
  it('drops an impossible slot', () => {
    expect(toMarketCoachDetail(raw({ next_available_slot: { start_time: '2026-11-02T19:00:00Z', end_time: '2026-11-02T18:00:00Z' } }))!.nextSlot).toBeNull()
  })
})

describe('review offer', () => {
  it('only when the coach offers paid reviews', () => {
    expect(toReviewOffer({ available: false })).toBeNull()
    expect(toReviewOffer({ available: true, price_formatted: '$15.00', turnaround_display: '48 hours' })).toEqual({ priceLabel: '$15.00', turnaround: '48 hours' })
  })
})

describe('sessions', () => {
  const now = Date.parse('2026-10-30T12:00:00Z')
  it('splits upcoming and past by time and status', () => {
    const a = toMarketSession({ id: 1, scheduled_at: '2026-11-01T18:00:00Z', duration_minutes: 60, status: 'confirmed', coach: { display_name: 'Nova' } }, now)!
    const b = toMarketSession({ id: 2, scheduled_at: '2026-10-20T18:00:00Z', duration_minutes: 30, status: 'completed', coach_notes: 'Hold angles', action_items: ['Crosshair drill'] }, now)!
    const c = toMarketSession({ id: 3, scheduled_at: '2026-11-03T18:00:00Z', status: 'cancelled' }, now)!
    const g = groupSessions([b, c, a])
    expect(g.upcoming.map(s => s.id)).toEqual([1])
    // Past: newest first (the cancelled future session counts as past).
    expect(g.past.map(s => s.id)).toEqual([3, 2])
    expect(a.statusLabel).toBe('Confirmed')
    expect(b.actionItems).toEqual(['Crosshair drill'])
    expect(c.statusLabel).toBe('Cancelled')
  })
  it('ignores rows without a time', () => {
    expect(toMarketSession({ id: 4, status: 'confirmed' }, now)).toBeNull()
  })
})

describe('paid reviews', () => {
  it('excludes roster reviews', () => {
    expect(toPaidReview({ id: 1, source: 'roster', status: 'completed' })).toBeNull()
  })
  it('maps marketplace reviews', () => {
    const r = toPaidReview({ id: 2, source: 'marketplace', status: 'completed', analysis_id: 55, coach: { display_name: 'Nova' }, analysis: { game_type: 'valorant' } })!
    expect(r).toMatchObject({ analysisId: 55, game: 'valorant', statusLabel: 'Notes ready', coachName: 'Nova' })
  })
})
