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

/** Bombsite anchor when Riot omits plantLocation or world coords land on the wrong site. */
export function resolveSitePlantAnchor(
  mapName: string | null | undefined,
  site: string | null | undefined,
): { norm: NormPoint; callout: string; site: string | null } | null {
  const letter = site?.trim().charAt(0).toUpperCase()
  if (!letter || !['A', 'B', 'C'].includes(letter)) return null

  const pack = loadPlantPack(mapName)
  if (!pack?.spots?.length) return null

  const names = [
    ...(letter === 'A' ? ['A Pyramids'] : []),
    `${letter} Default`,
    `${letter} Site`,
  ]
  for (const name of names) {
    const spot = pack.spots.find((s) => s.name === name)
    if (spot) {
      return { norm: { x: spot.x, y: spot.y }, callout: spot.name, site: spot.site ?? letter }
    }
  }

  const any = pack.spots.find((s) => (s.site ?? '').toUpperCase() === letter)
  if (any) {
    return { norm: { x: any.x, y: any.y }, callout: any.name, site: any.site ?? letter }
  }
  return null
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
