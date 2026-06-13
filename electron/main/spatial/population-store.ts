import { readFileSync } from 'fs'
import log from 'electron-log'
import type { AxiosInstance } from 'axios'
import { normalizeMapKey } from './map-transforms'
import { spatialResourcePath } from './paths'

export type RankScope = 'all' | 'diamond_plus' | 'immortal_plus'

export interface PlantPopulationSpot {
  all?: number
  diamond_plus?: number
  immortal_plus?: number
  betterSpot?: string
  betterWinPct?: number
  note?: string
}

export interface PeekPopulationSpot {
  defender_kd?: number
  attacker_kd?: number
  diamond_plus?: { defender_kd?: number; attacker_kd?: number }
  immortal_plus?: { defender_kd?: number; attacker_kd?: number }
  note?: string
}

export interface PopulationMapPack {
  plants?: Record<string, PlantPopulationSpot>
  peeks?: Record<string, PeekPopulationSpot>
  sample_size?: number
  act?: string
  source?: string
}

type BundledPopulationFile = Record<string, PopulationMapPack | { source?: string; rankKeys?: unknown }>

const TTL_MS = 6 * 60 * 60 * 1000

let bundled: BundledPopulationFile | null = null
const apiCache = new Map<string, { pack: PopulationMapPack; fetchedAt: number }>()
let inflight = new Map<string, Promise<PopulationMapPack | null>>()

function loadBundled(): BundledPopulationFile {
  if (!bundled) {
    const plants = JSON.parse(
      readFileSync(spatialResourcePath('benchmarks', 'plant-round-win.json'), 'utf8'),
    ) as BundledPopulationFile
    let peeks: BundledPopulationFile = {}
    try {
      peeks = JSON.parse(
        readFileSync(spatialResourcePath('benchmarks', 'peek-kd.json'), 'utf8'),
      ) as BundledPopulationFile
    } catch {
      peeks = {}
    }

    const merged: BundledPopulationFile = { ...plants }
    for (const [mapKey, peekEntry] of Object.entries(peeks)) {
      if (mapKey === '_meta') {
        merged._meta = peekEntry
        continue
      }
      const existing = normalizeMapEntry(merged[mapKey]) ?? {}
      const peekPack = normalizeMapEntry(peekEntry) ?? {}
      merged[mapKey] = {
        ...existing,
        peeks: { ...existing.peeks, ...peekPack.peeks },
        plants: { ...existing.plants, ...peekPack.plants },
      }
    }
    bundled = merged
  }
  return bundled
}

function normalizeMapEntry(entry: unknown): PopulationMapPack | null {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
  const raw = entry as Record<string, unknown>
  if (raw.plants || raw.peeks) {
    return {
      plants: raw.plants as Record<string, PlantPopulationSpot> | undefined,
      peeks: raw.peeks as Record<string, PeekPopulationSpot> | undefined,
      act: typeof raw.act === 'string' ? raw.act : undefined,
      source: typeof raw.source === 'string' ? raw.source : undefined,
      sample_size: typeof raw.sample_size === 'number' ? raw.sample_size : undefined,
    }
  }

  const plants: Record<string, PlantPopulationSpot> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'source' || key === 'act' || key === 'sample_size') continue
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      plants[key] = value as PlantPopulationSpot
    }
  }
  return Object.keys(plants).length ? { plants } : null
}

function mapPack(mapName: string | null | undefined): PopulationMapPack | null {
  const key = normalizeMapKey(mapName)
  if (!key) return null
  const file = loadBundled()
  const entry = file[key]
  return normalizeMapEntry(entry)
}

export function rankScope(tierName: string | null | undefined): RankScope {
  const t = (tierName ?? '').toLowerCase()
  if (t.includes('immortal') || t.includes('radiant')) return 'immortal_plus'
  if (t.includes('diamond') || t.includes('ascendant')) return 'diamond_plus'
  return 'all'
}

export function scopeLabel(scope: RankScope): string {
  if (scope === 'immortal_plus') return 'Immortal+'
  if (scope === 'diamond_plus') return 'Diamond+'
  return 'all ranks'
}

function mergePacks(base: PopulationMapPack | null, overlay: PopulationMapPack | null): PopulationMapPack | null {
  if (!base && !overlay) return null
  if (!base) return overlay
  if (!overlay) return base
  return {
    act: overlay.act ?? base.act,
    source: overlay.source ?? base.source,
    sample_size: overlay.sample_size ?? base.sample_size,
    plants: { ...base.plants, ...overlay.plants },
    peeks: { ...base.peeks, ...overlay.peeks },
  }
}

/** Merged population pack: bundled JSON + optional live API overlay. */
export function getPopulationPack(mapName: string | null | undefined): PopulationMapPack | null {
  const key = normalizeMapKey(mapName)
  if (!key) return null
  const local = mapPack(mapName)
  const cached = apiCache.get(key)
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return mergePacks(local, cached.pack)
  }
  return local
}

export function getPlantSpot(
  mapName: string | null | undefined,
  callout: string,
): PlantPopulationSpot | null {
  const pack = getPopulationPack(mapName)
  if (!pack?.plants || !callout || callout === 'Unknown') return null
  const direct = pack.plants[callout.trim()]
  if (direct) return direct
  const siteDefault = callout.match(/^([ABC]) Site$/i)
  if (siteDefault) {
    return pack.plants[`${siteDefault[1].toUpperCase()} Default`] ?? null
  }
  return null
}

function pickPeekKd(
  spot: PeekPopulationSpot,
  scope: RankScope,
): { defenderKd: number | null; attackerKd: number | null } {
  const scoped = scope === 'immortal_plus'
    ? spot.immortal_plus
    : scope === 'diamond_plus'
      ? spot.diamond_plus
      : null
  const defenderKd = scoped?.defender_kd ?? spot.defender_kd ?? null
  const attackerKd = scoped?.attacker_kd ?? spot.attacker_kd ?? null
  return { defenderKd, attackerKd }
}

export function getPeekSpot(
  mapName: string | null | undefined,
  callout: string,
): PeekPopulationSpot | null {
  const pack = getPopulationPack(mapName)
  if (!pack?.peeks || !callout || callout === 'Unknown') return null
  return pack.peeks[callout.trim()] ?? null
}

export function getPeekKd(
  mapName: string | null | undefined,
  callout: string,
  rankTierName: string | null | undefined,
): { defenderKd: number | null; attackerKd: number | null; note?: string } | null {
  const spot = getPeekSpot(mapName, callout)
  if (!spot) return null
  const scope = rankScope(rankTierName)
  const kd = pickPeekKd(spot, scope)
  if (kd.defenderKd == null && kd.attackerKd == null) return null
  return { ...kd, note: spot.note }
}

function normalizeApiPack(body: unknown, mapKey: string): PopulationMapPack | null {
  if (!body || typeof body !== 'object') return null
  const raw = body as Record<string, unknown>
  const mapBlock = (raw[mapKey] ?? raw.data ?? raw) as Record<string, unknown>
  if (!mapBlock || typeof mapBlock !== 'object') return null

  const plants = mapBlock.plants as Record<string, PlantPopulationSpot> | undefined
  const peeks = mapBlock.peeks as Record<string, PeekPopulationSpot> | undefined
  if (!plants && !peeks) return null

  return {
    plants,
    peeks,
    act: typeof mapBlock.act === 'string' ? mapBlock.act : undefined,
    source: typeof mapBlock.source === 'string' ? mapBlock.source : 'api',
    sample_size: typeof mapBlock.sample_size === 'number' ? mapBlock.sample_size : undefined,
  }
}

/** Fetch live population aggregates from UpForge API (falls back silently to bundled data). */
export async function refreshPopulationFromApi(
  mapName: string | null | undefined,
  api: AxiosInstance | null,
): Promise<PopulationMapPack | null> {
  const key = normalizeMapKey(mapName)
  if (!key || !api) return getPopulationPack(mapName)

  const cached = apiCache.get(key)
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return getPopulationPack(mapName)
  }

  const existing = inflight.get(key)
  if (existing) return existing

  const promise = (async () => {
    try {
      const res = await api.get('/api/spatial/population', {
        params: { map: key },
        timeout: 12_000,
      })
      const pack = normalizeApiPack(res.data, key)
      if (pack) {
        apiCache.set(key, { pack, fetchedAt: Date.now() })
        log.info(`[Spatial] Population API loaded for ${key} (n=${pack.sample_size ?? '?'})`)
        return mergePacks(mapPack(mapName), pack)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      log.debug(`[Spatial] Population API unavailable for ${key}: ${msg}`)
    }
    return getPopulationPack(mapName)
  })()

  inflight.set(key, promise)
  try {
    return await promise
  } finally {
    inflight.delete(key)
  }
}

export function clearPopulationApiCache(): void {
  apiCache.clear()
}

export function hasLivePopulationData(mapName: string | null | undefined): boolean {
  const key = normalizeMapKey(mapName)
  if (!key) return false
  const cached = apiCache.get(key)
  return !!cached && Date.now() - cached.fetchedAt < TTL_MS
}
