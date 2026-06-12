export interface Cs2FaceitConnection {
  connected: boolean
  nickname?: string
  elo?: number | null
  level?: number | null
  synced_at?: string | null
  has_auto_sync?: boolean
}

/** Official FACEIT level badge images (same CDN as faceit.com). */
const FACEIT_CDN = 'https://cdn.faceit.com/staticassets/stats_assets/csgo/players/level'

export function getFaceitLevelIconUrl(level: number | null | undefined): string | null {
  if (level == null || level < 1) return null
  const clamped = Math.max(1, Math.min(10, Math.round(level)))
  return `${FACEIT_CDN}/${clamped}_level.png`
}

/** Valve skill group images (community CDN used on upforge.gg/cs2). */
const CS2_RANK_CDN = 'https://static.csgostats.gg/images/ranks'

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

export function getCs2RankIconUrl(rank: string | null | undefined): string | null {
  if (!rank) return null
  const id = CS2_RANK_IMAGE_IDS[rank]
  if (id == null) return null
  return `${CS2_RANK_CDN}/${id}.png`
}
