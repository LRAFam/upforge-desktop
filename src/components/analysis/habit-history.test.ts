import { describe, expect, it } from 'vitest'
import { habitDrillRoute, habitLines, sanitizeHabitHistory } from './habit-history'

const hist = sanitizeHabitHistory({
  habits: [
    { id: 1, title: 'Dry peeking A main', earlier: 3, trend: 'stable' },
    { id: 2, title: 'Late rotations', earlier: 1, trend: 'improving' },
    { id: 3, title: 'Utility timing', earlier: 0 },
    { id: 4, title: 'Legacy', earlier: null },
    { id: 'x', title: 'bad' },
  ],
  drill: { id: 9, title: 'Angle clearing', trainer_scenario: 'angle_clearing' },
})

describe('habit history', () => {
  it('drops malformed rows', () => {
    expect(hist!.habits.map(h => h.id)).toEqual([1, 2, 3, 4])
    expect(sanitizeHabitHistory(null)).toBeNull()
  })
  it('calls repeats a habit, notes improving, marks new', () => {
    const lines = habitLines(hist)
    expect(lines[0]).toEqual({ id: 1, title: 'Dry peeking A main', tone: 'habit', note: 'Also in 3 earlier analysed matches. This is a habit, not a one-off, so fix it first.' })
    expect(lines[1].note).toBe('Also came up in 1 earlier analysed match. Coming up less than before, so keep going.')
    expect(lines[2]).toMatchObject({ tone: 'new', note: 'New this match.' })
    expect(lines[3]).toMatchObject({ tone: 'plain', note: null })
  })
  it('links the drill to Practice with the top habit as the reason', () => {
    expect(habitDrillRoute(hist)).toEqual({ path: '/training', query: { drill: 'Angle clearing', why: 'Dry peeking A main', scenario: 'angle_clearing' } })
    expect(habitDrillRoute({ habits: [], drill: null })).toBeNull()
  })
})
