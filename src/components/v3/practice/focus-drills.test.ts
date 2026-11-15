import { describe, expect, it } from 'vitest'
import { NO_DRILL_CAPTION, focusDrillPlan, focusMetricScenario } from './focus-drills'
import { parseDrillRulebook } from '../../../lib/drill-rulebook'
import { TRAINER_SCENARIOS } from '../../../lib/trainer-scenarios'
import { activeFocusOf } from './usePracticeFocus'

const ALL = TRAINER_SCENARIOS.map(s => s.key)

// Shape of GET /api/drills/rulebook with beta drills off (config/coach-drills.php on the API).
const RULEBOOK = parseDrillRulebook({
  headshot_hit_rate: { trigger: 'low_headshot', title: 'Raise your crosshair to head height', scenarios: [{ key: 'head_height', label: 'Head Height Corridor' }, { key: 'microflick', label: 'Micro Flick' }] },
  opening_death_rate: { trigger: 'opening_deaths', title: 'Win (or avoid) the first duel', scenarios: [{ key: 'duel', label: '3D Duel' }] },
  traded_death_rate: { trigger: 'untraded', title: 'Die where a teammate can trade you', scenarios: [] },
})

describe('focusDrillPlan', () => {
  it('returns nothing for unknown, empty or missing metrics, or before the rulebook loads', () => {
    expect(focusDrillPlan('made_up_metric', ALL, RULEBOOK)).toBeNull()
    expect(focusDrillPlan('', ALL, RULEBOOK)).toBeNull()
    expect(focusDrillPlan(null, ALL, RULEBOOK)).toBeNull()
    expect(focusDrillPlan('headshot_hit_rate', ALL, null)).toBeNull()
  })

  it('uses the rulebook order and title, limited to drills in the catalogue', () => {
    expect(focusDrillPlan('headshot_hit_rate', ALL, RULEBOOK)).toEqual({ metric: 'headshot_hit_rate', caption: 'Raise your crosshair to head height', scenarios: ['head_height', 'microflick'], noDrill: false })
    expect(focusDrillPlan('headshot_hit_rate', ['microflick'], RULEBOOK)!.scenarios).toEqual(['microflick'])
    expect(focusDrillPlan('opening_death_rate', ['flick'], RULEBOOK)).toBeNull()
  })

  it('says there is no drill for a positioning finding instead of sending it to aim drills', () => {
    const plan = focusDrillPlan('traded_death_rate', ALL, RULEBOOK)!
    expect(plan.noDrill).toBe(true)
    expect(plan.scenarios).toEqual([])
    expect(plan.caption).toBe(NO_DRILL_CAPTION)
    expect(focusMetricScenario('traded_death_rate', RULEBOOK)).toBeNull()
  })

  it('first scenario for the match report comes from the rulebook', () => {
    expect(focusMetricScenario('opening_death_rate', RULEBOOK)).toBe('duel')
    expect(focusMetricScenario('opening_death_rate', null)).toBeNull()
  })

  it('drops malformed rulebook entries', () => {
    expect(parseDrillRulebook([])).toBeNull()
    expect(parseDrillRulebook({ x: { scenarios: [{ label: 'no key' }, { key: 'flick' }] } })).toEqual({ x: { trigger: 'x', title: '', scenarios: [{ key: 'flick', label: 'flick' }] } })
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
