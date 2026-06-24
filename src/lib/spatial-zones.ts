import type { NormPoint } from './spatial-types'

import abyssZones from '../../resources/spatial/zones/abyss.json'
import ascentZones from '../../resources/spatial/zones/ascent.json'
import bindZones from '../../resources/spatial/zones/bind.json'
import breezeZones from '../../resources/spatial/zones/breeze.json'
import corrodeZones from '../../resources/spatial/zones/corrode.json'
import fractureZones from '../../resources/spatial/zones/fracture.json'
import havenZones from '../../resources/spatial/zones/haven.json'
import iceboxZones from '../../resources/spatial/zones/icebox.json'
import lotusZones from '../../resources/spatial/zones/lotus.json'
import pearlZones from '../../resources/spatial/zones/pearl.json'
import splitZones from '../../resources/spatial/zones/split.json'
import summitZones from '../../resources/spatial/zones/summit.json'
import sunsetZones from '../../resources/spatial/zones/sunset.json'

export interface ZoneCallout {
  name: string
  site: string | null
  x: number
  y: number
  radius: number
}

export interface ZonePack {
  map: string
  callouts: ZoneCallout[]
}

const MAP_ALIASES: Record<string, string> = {
  canyon: 'fracture',
  duality: 'bind',
  triad: 'haven',
  bonsai: 'split',
  port: 'icebox',
  foxtrot: 'breeze',
  pitt: 'pearl',
  jam: 'lotus',
  juliett: 'sunset',
  infinity: 'abyss',
  rook: 'corrode',
  plummet: 'summit',
}

const ZONE_PACKS: Record<string, ZonePack> = {
  abyss: abyssZones as ZonePack,
  ascent: ascentZones as ZonePack,
  bind: bindZones as ZonePack,
  breeze: breezeZones as ZonePack,
  corrode: corrodeZones as ZonePack,
  fracture: fractureZones as ZonePack,
  haven: havenZones as ZonePack,
  icebox: iceboxZones as ZonePack,
  lotus: lotusZones as ZonePack,
  pearl: pearlZones as ZonePack,
  split: splitZones as ZonePack,
  summit: summitZones as ZonePack,
  sunset: sunsetZones as ZonePack,
}

export function normalizeSpatialMapKey(mapName: string | null | undefined): string | null {
  if (!mapName) return null
  const key = mapName.trim().toLowerCase().replace(/\s+/g, '')
  return MAP_ALIASES[key] ?? key
}

export function getZonePack(mapName: string | null | undefined): ZonePack | null {
  const key = normalizeSpatialMapKey(mapName)
  if (!key) return null
  return ZONE_PACKS[key] ?? null
}

export function getCalloutAnchor(
  mapName: string | null | undefined,
  callout: string | null | undefined,
): NormPoint | null {
  if (!callout || callout === 'Unknown') return null
  const pack = getZonePack(mapName)
  if (!pack) return null
  const hit = pack.callouts.find((c) => c.name === callout.trim())
  return hit ? { x: hit.x, y: hit.y } : null
}

export function getSiteAnchor(
  mapName: string | null | undefined,
  site: string | null | undefined,
): NormPoint | null {
  if (!site || site === 'Spawn') return null
  const letter = site.trim().charAt(0).toUpperCase()
  return getCalloutAnchor(mapName, `${letter} Site`)
}

/** Prefer zone anchor; fall back to event norm or centroid of norms. */
export function resolveAnchorNorm(
  mapName: string | null | undefined,
  callout: string | null | undefined,
  fallback: NormPoint | NormPoint[] | null | undefined,
): NormPoint | null {
  const anchor = getCalloutAnchor(mapName, callout)
  if (anchor) return anchor
  if (!fallback) return null
  if (Array.isArray(fallback)) {
    if (!fallback.length) return null
    const xs = fallback.map((p) => p.x)
    const ys = fallback.map((p) => p.y)
    return {
      x: xs.reduce((a, b) => a + b, 0) / xs.length,
      y: ys.reduce((a, b) => a + b, 0) / ys.length,
    }
  }
  return fallback
}

export function calloutsWithActivity(
  mapName: string | null | undefined,
  names: Iterable<string>,
): ZoneCallout[] {
  const pack = getZonePack(mapName)
  if (!pack) return []
  const wanted = new Set([...names].filter((n) => n && n !== 'Unknown'))
  return pack.callouts.filter((c) => wanted.has(c.name))
}
