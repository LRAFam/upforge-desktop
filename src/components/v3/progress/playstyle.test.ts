import { describe, expect, it } from 'vitest'
import { agentPoolLine, categoryLabel, playstyleRows, roleSentence } from './playstyle'

const profile = {
  matches_tracked: 100,
  metrics: {
    first_death_rate_pct: 13.6,
    eco_sheriff_rate_pct: 25.2,
    util_casts_per_round: 1.95,
    roles_played: { Duelist: 56, Sentinel: 10, Initiator: 29, Controller: 5 },
    combat: { kd_ratio: 0.93, first_blood_got_rate_pct: 47.7, untraded_death_rate_pct: 36.1 },
  },
  agent_pool: { Fade: 29, Jett: 45, Omen: 1, Reyna: 11 },
}

describe('playstyle rows', () => {
  it('uses only the numbers the API computed, rounded for display', () => {
    expect(playstyleRows(profile).map(r => [r.label, r.value, r.pct])).toEqual([
      ['Opening duels won', '48%', 48],
      ['First to die', '14%', 14],
      ['Deaths with no trade', '36%', 36],
      ['Sheriff on eco rounds', '25%', 25],
      ['K/D', '0.93', null],
      ['Utility per round', '2.0', null],
    ])
  })
  it('skips missing metrics and returns nothing without a profile', () => {
    expect(playstyleRows({ matches_tracked: 2, metrics: { first_death_rate_pct: null } })).toEqual([])
    expect(playstyleRows(null)).toEqual([])
  })
  it('says the main role and agent pool with whole-number counts', () => {
    expect(roleSentence(profile)).toBe('Duelist in 56 of 100 tracked matches')
    expect(agentPoolLine(profile)).toBe('Jett 45 · Fade 29 · Reyna 11')
    expect(roleSentence({ matches_tracked: 0, metrics: {} })).toBeNull()
    expect(agentPoolLine({ matches_tracked: 0, metrics: {} })).toBeNull()
  })
  it('turns API category keys into labels', () => {
    expect(categoryLabel('decision_making')).toBe('Decision making')
    expect(categoryLabel('aim')).toBe('Aim')
  })
})
