/**
 * Focus metric → drills (board 23 "Today's session, from your focus"). Renderer-only and static:
 * the keys are the focus-loop metrics the AI service measures (services/match_report_facts.py
 * FOCUS_METRICS). Captions describe what the drills practise — never a claim about the player.
 */
export interface FocusDrillPlan {
  metric: string
  caption: string
  scenarios: string[]
}

const PLANS: Record<string, { caption: string; scenarios: string[] }> = {
  opening_death_rate: { caption: 'Drills for clearing one angle at a time before the first fight.', scenarios: ['angle_clearing', 'head_height'] },
  early_opening_death_rate: { caption: 'Drills for clearing one angle at a time before the first fight.', scenarios: ['angle_clearing', 'head_height'] },
  traded_death_rate: { caption: 'Drills for snapping to a second target fast, so you can trade.', scenarios: ['switching', 'flick'] },
  zero_damage_round_rate: { caption: 'Drills for landing damage in the first duel.', scenarios: ['duel', 'strafe_aim'] },
  headshot_hit_rate: { caption: 'Drills for keeping your crosshair at head height and fixing small misses.', scenarios: ['head_height', 'microadjust'] },
  leg_hit_rate: { caption: 'Drills for keeping your crosshair at head height instead of low on the body.', scenarios: ['head_height', 'sixshot'] },
}

/**
 * The plan for a focus metric, limited to drills that exist in the loaded catalogue.
 * Returns null for unknown metrics or when none of the mapped drills are available.
 */
export function focusDrillPlan(metric: string | null | undefined, available: readonly string[]): FocusDrillPlan | null {
  if (!metric) return null
  const plan = PLANS[metric]
  if (!plan) return null
  const have = new Set(available)
  const scenarios = plan.scenarios.filter(s => have.has(s))
  return scenarios.length ? { metric, caption: plan.caption, scenarios } : null
}

/** Metric keys this mapping knows about (for tests and notes). */
export const FOCUS_DRILL_METRICS = Object.keys(PLANS)
