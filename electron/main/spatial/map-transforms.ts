import { readFileSync } from 'fs'
import type { MapTransform, NormPoint } from './types'
import { spatialResourcePath } from './paths'

const manifestPath = spatialResourcePath('maps-manifest.json')

let manifest: MapTransform[] | null = null

function loadManifest(): MapTransform[] {
  if (!manifest) {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as MapTransform[]
  }
  return manifest
}

/** Normalise map name from Riot (Icebox, ICEBOX, icebox). */
export function normalizeMapKey(mapName: string | null | undefined): string | null {
  if (!mapName) return null
  return mapName.trim().toLowerCase().replace(/\s+/g, '')
}

export function getMapTransform(mapName: string | null | undefined): MapTransform | null {
  const key = normalizeMapKey(mapName)
  if (!key) return null
  return loadManifest().find((m) => normalizeMapKey(m.displayName) === key) ?? null
}

/** Riot world (x,y) → normalized minimap (0–1). */
export function worldToNorm(
  mapName: string | null | undefined,
  worldX: number,
  worldY: number,
): NormPoint | null {
  const t = getMapTransform(mapName)
  if (!t) return null
  const x = worldX * t.xMultiplier + t.xScalarToAdd
  const y = worldY * t.yMultiplier + t.yScalarToAdd
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return {
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y)),
  }
}

export function getMinimapUrl(mapName: string | null | undefined): string | null {
  return getMapTransform(mapName)?.displayIcon ?? null
}
