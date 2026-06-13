import { readFileSync, existsSync } from 'fs'
import { normalizeMapKey } from './map-transforms'
import { spatialResourcePath } from './paths'
import { resolveCallout } from './callout-resolver'
import type { CalloutAnchor, NormPoint } from './types'

interface PlantSpotPack {
  map: string
  spots: CalloutAnchor[]
}

const packCache = new Map<string, PlantSpotPack | null>()

function loadPlantPack(mapName: string | null | undefined): PlantSpotPack | null {
  const key = normalizeMapKey(mapName)
  if (!key) return null
  if (packCache.has(key)) return packCache.get(key) ?? null

  const filePath = spatialResourcePath('plants', `${key}.json`)
  if (!existsSync(filePath)) {
    packCache.set(key, null)
    return null
  }

  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf8')) as PlantSpotPack
    packCache.set(key, raw)
    return raw
  } catch {
    packCache.set(key, null)
    return null
  }
}

function dist(a: NormPoint, b: NormPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Resolve spike plant position to a named plant spot (tighter than kill callouts). */
export function resolvePlantCallout(
  mapName: string | null | undefined,
  norm: NormPoint,
): { callout: string; site: string | null } {
  const pack = loadPlantPack(mapName)
  if (!pack?.spots?.length) {
    return resolveCallout(mapName, norm)
  }

  let best: CalloutAnchor | null = null
  let bestD = Infinity
  for (const s of pack.spots) {
    const d = dist(norm, { x: s.x, y: s.y })
    if (d <= s.radius && d < bestD) {
      bestD = d
      best = s
    }
  }
  if (best) {
    return { callout: best.name, site: best.site ?? null }
  }

  let nearest: CalloutAnchor | null = null
  let nearestD = Infinity
  for (const s of pack.spots) {
    const d = dist(norm, { x: s.x, y: s.y })
    if (d < nearestD) {
      nearestD = d
      nearest = s
    }
  }
  const fallbackMax = Math.max(0.14, (nearest?.radius ?? 0.07) * 2)
  if (nearest && nearestD <= fallbackMax) {
    return { callout: nearest.name, site: nearest.site ?? null }
  }

  return resolveCallout(mapName, norm)
}
