import { readFileSync } from 'fs'
import type { NormPoint } from './types'
import { spatialResourcePath } from './paths'

export interface Cs2MapTransform {
  name: string
  displayName: string
  posX: number
  posY: number
  scale: number
  radarSize: number
  displayBounds?: { minX: number; minY: number; maxX: number; maxY: number }
}

let manifest: Cs2MapTransform[] | null = null

function loadManifest(): Cs2MapTransform[] {
  if (!manifest) {
    const raw = readFileSync(spatialResourcePath('cs2', 'maps-manifest.json'), 'utf8')
    manifest = JSON.parse(raw) as Cs2MapTransform[]
  }
  return manifest
}

/** Normalise demo header map names (de_dust2, workshop/.../de_mirage). */
export function normalizeCs2MapKey(mapName: string | null | undefined): string | null {
  if (!mapName) return null
  const lower = mapName.trim().toLowerCase().replace(/\\/g, '/')
  const base = lower.split('/').pop() ?? lower
  if (base.startsWith('de_') || base.startsWith('cs_')) return base
  return null
}

export function getCs2MapTransform(mapName: string | null | undefined): Cs2MapTransform | null {
  const key = normalizeCs2MapKey(mapName)
  if (!key) return null
  return loadManifest().find((m) => m.name === key) ?? null
}

/**
 * Convert Source-engine world (x, y) to normalized radar coords (0–1, origin top-left).
 * Uses Valve overview constants (pos_x, pos_y, scale) — same as demoinfocs / CS Demo Manager.
 */
export function cs2WorldToNorm(
  mapName: string | null | undefined,
  worldX: number,
  worldY: number,
): NormPoint | null {
  const t = getCs2MapTransform(mapName)
  if (!t || !Number.isFinite(worldX) || !Number.isFinite(worldY)) return null

  const size = t.radarSize > 0 ? t.radarSize : 1024
  const rawX = (worldX - t.posX) / t.scale / size
  const rawY = (t.posY - worldY) / t.scale / size

  if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) return null

  const bounds = t.displayBounds
  if (bounds && bounds.maxX > bounds.minX && bounds.maxY > bounds.minY) {
    const x = (rawX - bounds.minX) / (bounds.maxX - bounds.minX)
    const y = (rawY - bounds.minY) / (bounds.maxY - bounds.minY)
    return {
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y)),
    }
  }

  return {
    x: Math.max(0, Math.min(1, rawX)),
    y: Math.max(0, Math.min(1, rawY)),
  }
}

export function isCs2MapSupported(mapName: string | null | undefined): boolean {
  return getCs2MapTransform(mapName) != null
}
