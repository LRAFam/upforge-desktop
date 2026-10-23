import { describe, expect, it } from 'vitest'
import { focusHeadline, focusSlots, focusSubline, pct, type Focus } from './focus'

const base: Focus = {
  id: 1, metric: 'opening_death_rate', label: 'Opening deaths', better: 'lower', baseline: 0.364, target: 0.22,
  checks: [{ match_id: 'a', value: 0.18, hit: true, played_at: null }],
  progress: { games_played: 1, hits: 1, games_required: 3, hits_required: 2, status: 'active' },
  started_at: null, completed_at: null,
}

describe('focus display', () => {
  it('formats rates and slots', () => {
    expect(pct(0.364)).toBe('36%')
    expect(pct(null)).toBe('—')
    expect(focusSlots(base)).toEqual(['hit', 'pending', 'pending'])
  })
  it('describes active, achieved and missed focuses', () => {
    expect(focusHeadline(base)).toBe('Opening deaths under 22%')
    expect(focusSubline(base)).toBe('Started at 36%. Hit it in 1 more of your next 2 games.')
    const done = { ...base, progress: { ...base.progress, games_played: 2, hits: 2, status: 'achieved' } }
    expect(focusHeadline(done)).toBe('Focus achieved: opening deaths under 22%')
    const higher = { ...base, better: 'higher' as const, label: 'Deaths traded', target: 0.26 }
    expect(focusHeadline(higher)).toBe('Deaths traded over 26%')
  })
})
