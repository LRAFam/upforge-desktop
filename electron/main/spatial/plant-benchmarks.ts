import {
  getPlantSpot,
  rankScope,
  scopeLabel,
  type PlantPopulationSpot,
} from './population-store'

export { rankScope, scopeLabel } from './population-store'
export { resolvePlayerRankTier } from './plant-benchmarks-helpers'

function pickWinPct(entry: PlantPopulationSpot, scope: ReturnType<typeof rankScope>): number | null {
  if (scope === 'immortal_plus' && entry.immortal_plus != null) return entry.immortal_plus
  if (scope === 'diamond_plus' && entry.diamond_plus != null) return entry.diamond_plus
  if (scope === 'diamond_plus' && entry.immortal_plus != null) return entry.immortal_plus
  return entry.all ?? entry.immortal_plus ?? entry.diamond_plus ?? null
}

function normalizeSpotKey(callout: string): string {
  return callout.trim()
}

/** One-line population benchmark for a plant spot at the player's rank bracket. */
export function getPlantBenchmarkHint(
  mapName: string | null | undefined,
  callout: string,
  rankTierName: string | null | undefined,
): string | null {
  const entry = getPlantSpot(mapName, callout)
  if (!entry) return null

  const scope = rankScope(rankTierName)
  const winPct = pickWinPct(entry, scope)
  if (winPct == null) return null

  const label = scopeLabel(scope)
  let line = `${callout} converts ~${Math.round(winPct)}% post-plant (${label})`

  if (entry.betterSpot && entry.betterWinPct != null && entry.betterWinPct > winPct + 3) {
    if (normalizeSpotKey(callout) !== normalizeSpotKey(entry.betterSpot)) {
      line += ` — ${entry.betterSpot} ~${Math.round(entry.betterWinPct)}%`
    }
  } else if (entry.note) {
    line += ` · ${entry.note}`
  }

  return line
}
