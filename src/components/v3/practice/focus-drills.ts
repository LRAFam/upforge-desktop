/**
 * Focus metric → drills (board 23 "Today's session, from your focus"). The mapping is the API rulebook
 * (src/lib/drill-rulebook.ts); this file only fits it to the drills loaded in this catalogue.
 */
import type { DrillRulebook } from '../../../lib/drill-rulebook'

export interface FocusDrillPlan {
  metric: string
  caption: string
  scenarios: string[]
  /** The rulebook has no proven trainer drill for this finding (e.g. deaths traded). */
  noDrill: boolean
}

export const NO_DRILL_CAPTION = 'No trainer drill for this yet. Play your next matches with this in mind; the coach checks it after each one.'

/**
 * The plan for a focus metric from the rulebook, limited to drills that exist in the loaded catalogue.
 * Null while the rulebook is not loaded, for unknown metrics, or when none of its drills are loaded.
 */
export function focusDrillPlan(metric: string | null | undefined, available: readonly string[], rulebook: DrillRulebook | null): FocusDrillPlan | null {
  if (!metric || !rulebook) return null
  const entry = rulebook[metric]
  if (!entry) return null
  if (!entry.scenarios.length) return { metric, caption: NO_DRILL_CAPTION, scenarios: [], noDrill: true }
  const have = new Set(available)
  const scenarios = entry.scenarios.map(s => s.key).filter(s => have.has(s))
  return scenarios.length ? { metric, caption: entry.title, scenarios, noDrill: false } : null
}

/** First rulebook drill for a focus metric (unchecked against the catalogue; Practice validates it). */
export function focusMetricScenario(metric: string | null | undefined, rulebook: DrillRulebook | null): string | null {
  return (metric && rulebook?.[metric]?.scenarios[0]?.key) || null
}
