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
    expect(r.seen).toBe('Flagged 4 times')
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

  it('drops the API prefix (wrong "1 analyses" count) and never repeats the title', () => {
    const text = 'Untraded deaths — flagged across 1 analyses (133 sightings). Holds isolated positions far from team (R16 [29:36] B Lobby) resulting in untraded deaths. Maps: Lotus, Breeze, Haven, Corrode….'
    const [r] = recurringHabitRows([row({ label: 'Untraded deaths', text, occurrences: 133 })], NOW)
    expect(r.title).toBe('Untraded deaths')
    expect(r.detail).toBe('Holds isolated positions far from team (R16 [29:36] B Lobby) resulting in untraded deaths.')
    expect(r.detail).not.toContain('analyses')
    expect(r.maps).toEqual(['Lotus', 'Breeze', 'Haven', 'Corrode'])
    expect(r.seen).toBe('Flagged 133 times')
  })

  it('cuts a truncated API note at a whole word', async () => {
    const { parseHabitText } = await import('./recurring-habits')
    const p = parseHabitText('Game sense — flagged across 1 analyses (54 sightings). Engages duels while debuffed, where holding the an... Maps: Ascent.')
    expect(p.note).toBe('Engages duels while debuffed, where holding the…')
    expect(p.maps).toEqual(['Ascent'])
    expect(recurringHabitRows([row({ occurrences: 1 })], NOW)).toEqual([])
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

describe('withLocalStatuses', () => {
  it('hides a habit the player just marked fixed and restores it on undo', async () => {
    const { withLocalStatuses, recurringHabitRows } = await import('./recurring-habits')
    const rows = [
      { id: 1, label: 'Dies first', text: '', occurrences: 4, status: 'active', trend: null, lastSeenAt: null },
      { id: 2, label: 'Repeeks', text: '', occurrences: 3, status: 'active', trend: null, lastSeenAt: null },
    ]
    const fixed = recurringHabitRows(withLocalStatuses(rows, new Map([[1, 'resolved']])))
    expect(fixed.map(r => r.id)).toEqual([2])
    const undone = recurringHabitRows(withLocalStatuses(rows, new Map([[1, 'active']])))
    expect(undone.map(r => r.id)).toEqual([1, 2])
    expect(withLocalStatuses(null, new Map())).toEqual([])
  })
})

describe('habitSeen (audit 2026-11-02)', () => {
  it('counts matches when the API tracks them, times otherwise', async () => {
    const { habitSeen } = await import('./recurring-habits')
    expect(habitSeen(3, 2)).toBe('Flagged in 2 matches · 3 times')
    expect(habitSeen(1, 1)).toBe('Flagged in 1 match')
    expect(habitSeen(133, null)).toBe('Flagged 133 times')
  })
})
