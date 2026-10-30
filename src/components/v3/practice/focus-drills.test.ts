import { describe, expect, it } from 'vitest'
import { FOCUS_DRILL_METRICS, focusDrillPlan } from './focus-drills'
import { TRAINER_SCENARIOS } from '../../../lib/trainer-scenarios'
import { activeFocusOf } from './usePracticeFocus'

const ALL = TRAINER_SCENARIOS.map(s => s.key)

describe('focusDrillPlan', () => {
  it('returns nothing for unknown, empty or missing metrics', () => {
    expect(focusDrillPlan('made_up_metric', ALL)).toBeNull()
    expect(focusDrillPlan('', ALL)).toBeNull()
    expect(focusDrillPlan(null, ALL)).toBeNull()
  })

  it('maps every known focus metric only to drills that exist in the trainer catalogue', () => {
    for (const metric of FOCUS_DRILL_METRICS) {
      const plan = focusDrillPlan(metric, ALL)
      expect(plan, metric).not.toBeNull()
      expect(plan!.scenarios.length).toBeGreaterThanOrEqual(2)
      expect(plan!.scenarios.length).toBeLessThanOrEqual(3)
      for (const s of plan!.scenarios) expect(ALL).toContain(s)
    }
  })

  it('covers every focus-loop metric the AI service measures (services/match_report_facts.py)', () => {
    expect(FOCUS_DRILL_METRICS.sort()).toEqual(['early_opening_death_rate', 'headshot_hit_rate', 'leg_hit_rate', 'opening_death_rate', 'traded_death_rate', 'zero_damage_round_rate'])
  })

  it('drops drills that are not loaded, and returns null when none are left', () => {
    expect(focusDrillPlan('opening_death_rate', ['angle_clearing', 'flick'])!.scenarios).toEqual(['angle_clearing'])
    expect(focusDrillPlan('opening_death_rate', ['flick'])).toBeNull()
  })
})

describe('activeFocusOf', () => {
  const focus = (status: string) => ({ id: 1, metric: 'opening_death_rate', label: 'Opening deaths', better: 'lower' as const, baseline: 0.3, target: 0.2, checks: [],
    progress: { games_played: 0, hits: 0, games_required: 3, hits_required: 2, status }, started_at: null, completed_at: null })
  it('only returns an active focus from a successful response', () => {
    expect(activeFocusOf({ success: true, focus: focus('active'), history: [], notes_usage: { used: 0, limit: 0 } })?.metric).toBe('opening_death_rate')
    expect(activeFocusOf({ success: true, focus: focus('achieved'), history: [], notes_usage: { used: 0, limit: 0 } })).toBeNull()
    expect(activeFocusOf({ success: false, focus: focus('active'), history: [], notes_usage: { used: 0, limit: 0 } })).toBeNull()
    expect(activeFocusOf(null)).toBeNull()
  })
})
