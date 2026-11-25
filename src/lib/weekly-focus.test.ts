import { describe, expect, it } from 'vitest'
import { buildWeeklyFocusPlan } from './weekly-focus'

describe('buildWeeklyFocusPlan basis', () => {
  it('shows what a playstyle goal is based on, flagged as an early read when the sample is small', () => {
    const plan = buildWeeklyFocusPlan({ playstyleFocus: [{ category: 'positioning', text: 'Slow early peeks.', severity: 'medium', sample: 'last 4 tracked matches', early_read: true }] })
    expect(plan?.goal).toBe('Slow early peeks.')
    expect(plan?.basis).toBe('Early read · last 4 tracked matches')
    const team = buildWeeklyFocusPlan({ playstyleFocus: [{ category: 'team_comp', text: 'You lost 5 of 6 games where your team had no Controller.', severity: 'medium', sample: '6 games · last 40 tracked matches', early_read: false }] })
    expect(team?.basis).toBe('6 games · last 40 tracked matches')
  })
  it('has no basis line for older API data without a sample', () => {
    expect(buildWeeklyFocusPlan({ playstyleFocus: [{ category: 'x', text: 'Goal.', severity: 'high' }] })?.basis).toBeUndefined()
  })
})
