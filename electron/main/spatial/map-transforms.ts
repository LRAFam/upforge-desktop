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

const MAP_NAME_ALIASES: Record<string, string> = {
  duality: 'bind',
  triad: 'haven',
  bonsai: 'split',
  port: 'icebox',
  foxtrot: 'breeze',
  canyon: 'fracture',
  pitt: 'pearl',
  jam: 'lotus',
  juliett: 'sunset',
  infinity: 'abyss',
  rook: 'corrode',
  plummet: 'summit',
}

/** Normalise map name from Riot (Icebox, ICEBOX, icebox, Canyon → fracture). */
export function normalizeMapKey(mapName: string | null | undefined): string | null {
  if (!mapName) return null
  const key = mapName.trim().toLowerCase().replace(/\s+/g, '')
  return MAP_NAME_ALIASES[key] ?? key
}

export function getMapTransform(mapName: string | null | undefined): MapTransform | null {
  const key = normalizeMapKey(mapName)
  if (!key) return null
  return loadManifest().find((m) => normalizeMapKey(m.displayName) === key) ?? null
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

/**
 * Riot world (x,y) → valorant-api displayicon UV (0–1).
 *
 * Official formula swaps axes: multipliers apply to the opposite game axis.
 * @see https://gist.github.com/faheem-s27/3f527cd2dbf88cfadd7bdb649092ccfa
 */
export function rawWorldToTransform(t: MapTransform, worldX: number, worldY: number): NormPoint | null {
  const x = worldY * t.xMultiplier + t.xScalarToAdd
  const y = worldX * t.yMultiplier + t.yScalarToAdd
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x, y }
}

/** Clamp raw transform UV to the displayicon. Viewport stretch is intentionally unused. */
export function transformToDisplayNorm(_t: MapTransform, raw: NormPoint): NormPoint {
  return { x: clamp01(raw.x), y: clamp01(raw.y) }
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
