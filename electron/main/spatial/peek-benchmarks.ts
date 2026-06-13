import { readFileSync, existsSync } from 'fs'
import { getPeekKd, rankScope, scopeLabel } from './population-store'
import { normalizeMapKey } from './map-transforms'
import { spatialResourcePath } from './paths'
import type { NormPoint, PeekHotspot } from './types'

interface ZoneCallout {
  name: string
  x: number
  y: number
}

/** One-line population peek K/D hint for a death callout. */
export function getPeekBenchmarkHint(
  mapName: string | null | undefined,
  callout: string,
  rankTierName: string | null | undefined,
): string | null {
  const kd = getPeekKd(mapName, callout, rankTierName)
  if (!kd) return null

  const scope = rankScope(rankTierName)
  const label = scopeLabel(scope)
  const defender = kd.defenderKd
  if (defender == null) return null

  if (defender >= 1.08) {
    let line = `${callout} peek K/D favors defenders ~${defender.toFixed(2)}:1 (${label})`
    if (kd.note) line += ` · ${kd.note}`
    return line
  }
  if (defender <= 0.95 && kd.attackerKd != null && kd.attackerKd >= 1.05) {
    let line = `${callout} peek K/D favors attackers ~${kd.attackerKd.toFixed(2)}:1 (${label})`
    if (kd.note) line += ` · ${kd.note}`
    return line
  }
  return null
}

function loadZoneCallouts(mapName: string | null | undefined): ZoneCallout[] {
  const key = normalizeMapKey(mapName)
  if (!key) return []
  const filePath = spatialResourcePath('zones', `${key}.json`)
  if (!existsSync(filePath)) return []
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf8')) as { callouts?: ZoneCallout[] }
    return raw.callouts ?? []
  } catch {
    return []
  }
}

/** Population peek hotspots for minimap overlay (defender-favored angles). */
export function buildPeekHotspots(mapName: string | null | undefined): PeekHotspot[] {
  const callouts = loadZoneCallouts(mapName)
  const hotspots: PeekHotspot[] = []
  for (const c of callouts) {
    const kd = getPeekKd(mapName, c.name, null)
    const defenderKd = kd?.defenderKd
    if (defenderKd == null || defenderKd < 1.05) continue
    hotspots.push({
      callout: c.name,
      norm: { x: c.x, y: c.y },
      defenderKd,
    })
  }
  return hotspots.sort((a, b) => b.defenderKd - a.defenderKd).slice(0, 24)
}

export function resolvePeekNorm(
  mapName: string | null | undefined,
  callout: string,
): NormPoint | null {
  const callouts = loadZoneCallouts(mapName)
  const hit = callouts.find((c) => c.name === callout)
  if (hit) return { x: hit.x, y: hit.y }
  return null
}
