import { describe, expect, it } from 'vitest'
import type { Focus } from './focus'
import { lolFocusGoal, lolFocusHeadline, lolFocusSubline } from './lol-focus'

const focus = (over: Partial<Focus> = {}): Focus => ({
  id: 1, metric: 'deaths', label: 'Deaths per game', better: 'lower', baseline: 6.5, target: 6,
  checks: [], progress: { games_played: 1, hits: 1, games_required: 3, hits_required: 2, status: 'active' },
  started_at: null, completed_at: null, ...over,
})

describe('League focus wording', () => {
  it('states goals in whole numbers and the right unit', () => {
    expect(lolFocusGoal(focus())).toBe('Die 6 times or fewer')
    expect(lolFocusGoal(focus({ target: 1 }))).toBe('Die 1 time or fewer')
    expect(lolFocusGoal(focus({ target: 0 }))).toBe('Finish games with no deaths')
    expect(lolFocusGoal(focus({ metric: 'cs_at_10', better: 'higher', target: 65 }))).toBe('Reach 65 CS by 10:00')
    expect(lolFocusGoal(focus({ metric: 'vision_per_min', better: 'higher', target: 1.2 }))).toBe('Keep vision score at 1.2 per minute or more')
    expect(lolFocusGoal(focus({ metric: 'kill_participation', better: 'higher', target: 0.55 }))).toBe("Take part in 55% of your team's kills")
  })

  it('never puts a fractional count in a sentence', () => {
    expect(lolFocusSubline(focus())).toBe('Lately: 7 deaths a game. Hit it in 1 more of your next 2 games.')
    expect(lolFocusSubline(focus())).not.toMatch(/\d\.\d+ death/)
  })

  it('achieved and missed headlines', () => {
    expect(lolFocusHeadline(focus({ progress: { games_played: 2, hits: 2, games_required: 3, hits_required: 2, status: 'achieved' } }))).toBe('Focus achieved: die 6 times or fewer')
    expect(lolFocusHeadline(focus({ progress: { games_played: 3, hits: 1, games_required: 3, hits_required: 2, status: 'missed' } }))).toBe('Not this time: die 6 times or fewer')
  })
})
