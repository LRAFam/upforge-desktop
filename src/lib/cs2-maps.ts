import cs2Manifest from '../../resources/spatial/cs2/maps-manifest.json'
import deAncientRadar from '../../resources/spatial/cs2/radars/de_ancient.png'
import deAnubisRadar from '../../resources/spatial/cs2/radars/de_anubis.png'
import deDust2Radar from '../../resources/spatial/cs2/radars/de_dust2.png'
import deInfernoRadar from '../../resources/spatial/cs2/radars/de_inferno.png'
import deMirageRadar from '../../resources/spatial/cs2/radars/de_mirage.png'
import deNukeRadar from '../../resources/spatial/cs2/radars/de_nuke.png'
import deOverpassRadar from '../../resources/spatial/cs2/radars/de_overpass.png'

interface Cs2MapEntry {
  name: string
  displayName: string
}

const RADAR_BY_KEY: Record<string, string> = {
  de_ancient: deAncientRadar,
  de_anubis: deAnubisRadar,
  de_dust2: deDust2Radar,
  de_inferno: deInfernoRadar,
  de_mirage: deMirageRadar,
  de_nuke: deNukeRadar,
  de_overpass: deOverpassRadar,
}

const DISPLAY_BY_KEY = new Map(
  (cs2Manifest as Cs2MapEntry[]).map((m) => [m.name, m.displayName]),
)

export function normalizeCs2MapKey(mapName: string | null | undefined): string | null {
  if (!mapName) return null
  const lower = mapName.trim().toLowerCase().replace(/\\/g, '/')
  const base = lower.split('/').pop() ?? lower
  if (base.startsWith('de_') || base.startsWith('cs_')) return base
  return null
}

export function isCs2Map(mapName: string | null | undefined): boolean {
  const key = normalizeCs2MapKey(mapName)
  return !!key && key in RADAR_BY_KEY
}

export function getCs2RadarUrl(mapName: string | null | undefined): string {
  const key = normalizeCs2MapKey(mapName)
  if (!key) return ''
  return RADAR_BY_KEY[key] ?? ''
}

export function cs2MapDisplayName(mapName: string | null | undefined): string {
  const key = normalizeCs2MapKey(mapName)
  if (!key) return mapName ?? ''
  return DISPLAY_BY_KEY.get(key) ?? key
}

export const SUPPORTED_CS2_MAPS = Object.keys(RADAR_BY_KEY)
