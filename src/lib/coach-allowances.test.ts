import { describe, expect, it } from 'vitest'
import { foundLine, momentsLine, notesLine, roundReviewsLine } from './coach-allowances'

const now = new Date('2026-10-31T12:00:00Z')
const a = (remaining: number, limit: number, resets = '2026-11-01T00:00:00Z', period?: 'week' | 'month') =>
  ({ enabled: true, used: limit - remaining, limit, remaining, resets_at: resets, period })

describe('allowance lines', () => {
  it('uses whole numbers and plurals', () => {
    expect(notesLine(a(2, 3), now)).toBe('2 of 3 coach notes left today')
    expect(notesLine(a(1, 1), now)).toBe('1 of 1 coach note left today')
    expect(momentsLine(a(3, 4, '2026-12-01T00:00:00Z'), now)).toBe('3 of 4 key-moment reviews left this month')
    expect(roundReviewsLine(a(1, 1, '2026-11-02T00:00:00Z', 'week'), now)).toBe('1 of 1 round review left this week')
  })
  it('says honestly when an allowance is used up and when it returns', () => {
    expect(notesLine(a(0, 3), now)).toBe("Today's coach notes are used. They return tomorrow.")
    expect(momentsLine(a(0, 4, '2026-12-01T00:00:00Z'), now)).toMatch(/^This month's key-moment reviews are used\. They reset on /)
  })
  it('hides disabled or zero allowances', () => {
    expect(notesLine({ ...a(3, 3), enabled: false }, now)).toBeNull()
    expect(roundReviewsLine(a(0, 0), now)).toBeNull()
    expect(notesLine(null, now)).toBeNull()
  })
  it('post-game line shows what the coach found', () => {
    expect(foundLine({ state: 'done', found: 2 })).toBe('Your coach found 2 things')
    expect(foundLine({ state: 'reviewing', found: 0 })).toBe('Your coach is watching the key moments…')
    expect(foundLine({ state: 'skipped', found: 0 })).toBeNull()
  })
})
