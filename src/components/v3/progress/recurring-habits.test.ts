import { describe, expect, it } from 'vitest'
import { recurringHabitRows, relativeDays } from './recurring-habits'

const NOW = Date.parse('2026-10-30T12:00:00Z')
const row = (o: Partial<Parameters<typeof recurringHabitRows>[0] extends readonly (infer T)[] | null | undefined ? T : never>) => ({
  id: 1, label: null, text: 'You peek alone after a teammate dies. That costs you trades.', occurrences: 4,
  status: 'active', trend: 'stable', lastSeenAt: '2026-10-27T12:00:00Z', ...o,
})

describe('recurringHabitRows', () => {
  it('uses whole-number counts, the first sentence as title and an honest trend', () => {
    const [r] = recurringHabitRows([row({})], NOW)
    expect(r.title).toBe('You peek alone after a teammate dies.')
    expect(r.seen).toBe('Flagged in 4 analysed matches')
    expect(r.lastSeen).toBe('3 days ago')
    expect(r.trend).toEqual({ label: 'Steady', tone: 'steady' })
  })

  it('drops resolved habits and one-offs, sorts by count, caps at five', () => {
    const rows = [
      row({ id: 1, occurrences: 2 }), row({ id: 2, occurrences: 9 }), row({ id: 3, status: 'resolved', occurrences: 20 }),
      row({ id: 4, occurrences: 1 }), row({ id: 5, occurrences: 3 }), row({ id: 6, occurrences: 5 }),
      row({ id: 7, occurrences: 6 }), row({ id: 8, occurrences: 7 }),
    ]
    expect(recurringHabitRows(rows, NOW).map(r => r.id)).toEqual([2, 8, 7, 6, 5])
  })

  it('maps improving and worsening trends; unknown shows no trend', () => {
    expect(recurringHabitRows([row({ trend: 'improving' })], NOW)[0].trend?.tone).toBe('better')
    expect(recurringHabitRows([row({ trend: 'worsening' })], NOW)[0].trend?.label).toBe('Coming up more')
    expect(recurringHabitRows([row({ trend: 'unknown' })], NOW)[0].trend).toBeNull()
  })

  it('prefers the theme label and keeps the sentence as detail', () => {
    const [r] = recurringHabitRows([row({ label: 'Re-peeking after a teammate dies' })], NOW)
    expect(r.title).toBe('Re-peeking after a teammate dies')
    expect(r.detail).toBe('You peek alone after a teammate dies.')
  })

  it('returns nothing for empty or missing data', () => {
    expect(recurringHabitRows(null, NOW)).toEqual([])
    expect(recurringHabitRows([], NOW)).toEqual([])
  })
})

describe('relativeDays', () => {
  it('handles today, yesterday, days and bad input', () => {
    expect(relativeDays('2026-10-30T08:00:00Z', NOW)).toBe('today')
    expect(relativeDays('2026-10-29T08:00:00Z', NOW)).toBe('yesterday')
    expect(relativeDays('2026-09-20T08:00:00Z', NOW)).toBe('a month ago')
    expect(relativeDays('nope', NOW)).toBeNull()
  })
})
