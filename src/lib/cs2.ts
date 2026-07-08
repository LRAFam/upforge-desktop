export interface Cs2FaceitConnection {
  connected: boolean
  nickname?: string
  elo?: number | null
  level?: number | null
  synced_at?: string | null
  has_auto_sync?: boolean
}

export interface Cs2PlayerIdentity {
  steam_display_name: string | null
  steam_id: string | null
  linked: boolean
}

export interface Cs2ValveStats {
  matches_tracked: number
  avg_kd: number | null
  premier_rating: number | null
  map_breakdown: Array<{ map: string; matches: number }>
  source: string
}

export interface Cs2ProfilePayload {
  identity: Cs2PlayerIdentity
  valve_stats: Cs2ValveStats
  faceit: Cs2FaceitConnection & { connected: boolean }
}

const CS2_RANK_IMAGE_IDS: Record<string, number> = {
  'Silver I': 1,
  'Silver II': 2,
  'Silver III': 3,
  'Silver IV': 4,
  'Silver Elite': 5,
  'Gold Nova I': 7,
  'Gold Nova II': 8,
  'Gold Nova III': 9,
  'Gold Nova Master': 10,
  'Master Guardian I': 11,
  'Master Guardian II': 12,
  'Master Guardian Elite': 13,
  'Distinguished Master Guardian': 14,
  'Legendary Eagle': 15,
  'Legendary Eagle Master': 16,
  'Supreme Master First Class': 17,
  'Global Elite': 18,
}

function cs2RankAsset(id: number): string {
  return new URL(`../assets/ranks/cs2/${id}.png`, import.meta.url).href
}

function faceitLevelAsset(level: number): string {
  return new URL(`../assets/ranks/faceit/${level}.png`, import.meta.url).href
}

/** Bundled FACEIT level badge (official CDN blocks Electron CSP / hotlinking). */
export function getFaceitLevelIconUrl(level: number | null | undefined): string | null {
  if (level == null || level < 1) return null
  const clamped = Math.max(1, Math.min(10, Math.round(level)))
  return faceitLevelAsset(clamped)
}

/** Bundled Valve skill group icons (from csgostats.gg, stored under src/assets/ranks/cs2). */
export function getCs2RankIconUrl(rank: string | null | undefined): string | null {
  if (!rank) return null
  const id = CS2_RANK_IMAGE_IDS[rank]
  if (id == null) return null
  return cs2RankAsset(id)
}
