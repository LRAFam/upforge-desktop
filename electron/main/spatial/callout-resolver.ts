import { readFileSync, existsSync, readdirSync } from 'fs'
import { normalizeMapKey } from './map-transforms'
import { spatialResourcePath } from './paths'
import type { CalloutAnchor, MapCalloutPack, NormPoint } from './types'

const packCache = new Map<string, MapCalloutPack | null>()

function loadCalloutPack(mapName: string | null | undefined): MapCalloutPack | null {
  const key = normalizeMapKey(mapName)
  if (!key) return null
  if (packCache.has(key)) return packCache.get(key) ?? null

  const filePath = spatialResourcePath('zones', `${key}.json`)
  if (!existsSync(filePath)) {
    packCache.set(key, null)
    return null
  }

  try {
    const pack = JSON.parse(readFileSync(filePath, 'utf8')) as MapCalloutPack
    packCache.set(key, pack)
    return pack
  } catch {
    packCache.set(key, null)
    return null
  }
}

function dist(a: NormPoint, b: NormPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Point-in-polygon (ray casting) for site fallback. */
function pointInPolygon(p: NormPoint, polygon: NormPoint[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x
    const yi = polygon[i].y
    const xj = polygon[j].x
    const yj = polygon[j].y
    const intersect = ((yi > p.y) !== (yj > p.y))
      && (p.x < ((xj - xi) * (p.y - yi)) / (yj - yi + 1e-12) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

export function resolveCallout(
  mapName: string | null | undefined,
  norm: NormPoint,
): { callout: string; site: string | null } {
  const pack = loadCalloutPack(mapName)
  if (!pack) {
    return { callout: 'Unknown', site: null }
  }

  let best: CalloutAnchor | null = null
  let bestD = Infinity
  for (const c of pack.callouts) {
    const d = dist(norm, { x: c.x, y: c.y })
    if (d <= c.radius && d < bestD) {
      bestD = d
      best = c
    }
  }

  if (best) {
    return { callout: best.name, site: best.site ?? null }
  }

  // Fallback: nearest anchor when strict radius misses (common before display calibration).
  let nearest: CalloutAnchor | null = null
  let nearestD = Infinity
  for (const c of pack.callouts) {
    const d = dist(norm, { x: c.x, y: c.y })
    if (d < nearestD) {
      nearestD = d
      nearest = c
    }
  }
  const fallbackMax = Math.max(0.12, (nearest?.radius ?? 0.075) * 1.75)
  if (nearest && nearestD <= fallbackMax) {
    return { callout: nearest.name, site: nearest.site ?? null }
  }

  if (pack.sites?.length) {
    for (const z of pack.sites) {
      if (pointInPolygon(norm, z.polygon)) {
        return { callout: `${z.site} Site`, site: z.site }
      }
    }
  }

  return { callout: 'Unknown', site: null }
}

export function listSupportedSpatialMaps(): string[] {
  try {
    return readdirSync(spatialResourcePath('zones'))
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace('.json', ''))
  } catch {
    return []
  }
}
