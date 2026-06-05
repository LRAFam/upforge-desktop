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

function rawWorldToTransform(t: MapTransform, worldX: number, worldY: number): NormPoint | null {
  const x = worldX * t.xMultiplier + t.xScalarToAdd
  const y = worldY * t.yMultiplier + t.yScalarToAdd
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x, y }
}

/** Map raw transform coords to 0–1 using per-map viewport (valorant displayicon space). */
export function transformToDisplayNorm(t: MapTransform, raw: NormPoint): NormPoint {
  const vp = t.viewport
  if (!vp || vp.maxX <= vp.minX || vp.maxY <= vp.minY) {
    return {
      x: Math.max(0, Math.min(1, raw.x)),
      y: Math.max(0, Math.min(1, raw.y)),
    }
  }
  const pad = 0.02
  const minX = vp.minX - pad
  const maxX = vp.maxX + pad
  const minY = vp.minY - pad
  const maxY = vp.maxY + pad
  return {
    x: Math.max(0, Math.min(1, (raw.x - minX) / (maxX - minX))),
    y: Math.max(0, Math.min(1, (raw.y - minY) / (maxY - minY))),
  }
}

/** Riot world (x,y) → normalized minimap (0–1 on displayicon). */
export function worldToNorm(
  mapName: string | null | undefined,
  worldX: number,
  worldY: number,
): NormPoint | null {
  const t = getMapTransform(mapName)
  if (!t) return null
  const raw = rawWorldToTransform(t, worldX, worldY)
  if (!raw) return null
  return transformToDisplayNorm(t, raw)
}

export function getMinimapUrl(mapName: string | null | undefined): string | null {
  return getMapTransform(mapName)?.displayIcon ?? null
}
