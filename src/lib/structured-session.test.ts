import { describe, expect, it } from 'vitest'
import { buildStructuredSessionPlan, coachingDrillToSessionDrill, type CoachingDrillLike } from './structured-session'
import { buildWeeklyFocusPlan } from './weekly-focus'

const drill = (over: Partial<CoachingDrillLike>): CoachingDrillLike => ({
  id: 1, category: 'mechanics', title: 'Drill', baseline_score: 5, ...over,
})

describe('coachingDrillToSessionDrill', () => {
  it('skips drills the aim trainer cannot train', () => {
    expect(coachingDrillToSessionDrill(drill({ category: 'utility_usage', godot_config: null }))).toBeNull()
    expect(coachingDrillToSessionDrill(drill({ category: 'economy' }))).toBeNull()
    expect(coachingDrillToSessionDrill(drill({ category: 'communication', godot_config: { scenario: 'flick' } }))).toBeNull()
  })
  it('builds a session drill for aim categories and explicit scenarios', () => {
    expect(coachingDrillToSessionDrill(drill({ category: 'crosshair_placement' }))).toMatchObject({ scenario: 'head_height', user_drill_id: 1 })
    expect(coachingDrillToSessionDrill(drill({ category: 'utility_usage', trainer_scenario: 'tracking' }))?.scenario).toBe('tracking')
  })
  it('guided session from coaching drills contains only trainable ones', () => {
    const drills = [drill({ id: 1, category: 'utility_usage' }), drill({ id: 2, category: 'positioning' })]
    const focus = drills.map(coachingDrillToSessionDrill).find(d => d !== null) ?? null
    const plan = buildStructuredSessionPlan({ focusDrill: focus })
    expect(plan.find(s => s.phase === 'focus')).toMatchObject({ scenario: 'duel', user_drill_id: 2 })
    expect(plan.some(s => s.user_drill_id === 1)).toBe(false)
  })
})

describe('weekly focus', () => {
  it('offers no trainer drill for a utility, economy, agent pool or team comp focus', () => {
    for (const category of ['utility', 'economy', 'agent_pool', 'team_comp']) {
      const plan = buildWeeklyFocusPlan({ playstyleFocus: [{ category, text: 'Use utility before you peek', severity: 'high' }] })
      expect(plan?.drill).toEqual({ label: 'Practise in game', scenario: null })
    }
  })
  it('keeps a trainer drill for an aim focus', () => {
    const plan = buildWeeklyFocusPlan({ playstyleFocus: [{ category: 'positioning', text: 'Stop wide peeking', severity: 'high' }] })
    expect(plan?.drill.scenario).toBe('duel')
  })
})
