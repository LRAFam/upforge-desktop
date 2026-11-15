/**
 * The API's finding → drill rulebook (GET /api/drills/rulebook, config/coach-drills.php on the API).
 * Desktop keeps no table of its own: an empty `scenarios` list means there is no proven drill for that
 * finding yet, and the app says so instead of offering an unrelated aim drill.
 */
import { ref, type Ref } from 'vue'

export interface DrillRulebookEntry {
  trigger: string
  title: string
  scenarios: { key: string; label: string }[]
}

export type DrillRulebook = Record<string, DrillRulebookEntry>

/** Keep only well-formed entries (the response is untrusted JSON). */
export function parseDrillRulebook(raw: unknown): DrillRulebook | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const out: DrillRulebook = {}
  for (const [metric, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue
    const e = v as Record<string, unknown>
    const scenarios = Array.isArray(e.scenarios)
      ? e.scenarios.filter((s): s is { key: string; label: string } =>
        !!s && typeof s === 'object' && typeof (s as { key?: unknown }).key === 'string')
        .map(s => ({ key: s.key, label: typeof s.label === 'string' ? s.label : s.key }))
      : []
    out[metric] = { trigger: typeof e.trigger === 'string' ? e.trigger : metric, title: typeof e.title === 'string' ? e.title : '', scenarios }
  }
  return out
}

const cache: Ref<DrillRulebook | null> = ref(null)
let inflight: Promise<void> | null = null

/** Shared, loaded once per app run (retried on the next call when it failed). Valorant only for now. */
export function useDrillRulebook(api?: { getDrillRulebook?: (game?: string) => Promise<unknown> }): Ref<DrillRulebook | null> {
  if (!cache.value && !inflight && api?.getDrillRulebook) {
    inflight = api.getDrillRulebook('valorant')
      .then(raw => { cache.value = parseDrillRulebook(raw) })
      .catch(() => {})
      .finally(() => { inflight = null })
  }
  return cache
}
