const RANK_TIERS: Record<string, number> = {
  Obscurus: 0,
  Initiate: 1,
  Seeker: 2,
  Alchemist: 3,
  Arcanist: 4,
  Ritualist: 5,
  Emissary: 6,
  Archon: 7,
  Oracle: 8,
  Phantom: 9,
  Ascendant: 10,
  Eternus: 11,
}

const DEADLOCK_ASSETS_BASE = 'https://assets-bucket.deadlock-api.com/assets-api-res'

/** Resolve a Deadlock hero portrait URL from API stats (absolute or assets-relative). */
export function getDeadlockHeroIconUrl(icon: string | null | undefined): string | null {
  if (!icon) return null
  if (icon.startsWith('http://') || icon.startsWith('https://')) return icon
  if (icon.startsWith('/')) return `${DEADLOCK_ASSETS_BASE}${icon}`
  return `${DEADLOCK_ASSETS_BASE}/images/heroes/${icon}`
}

function deadlockRankAsset(filename: string): string {
  return new URL(`../assets/ranks/deadlock/${filename}`, import.meta.url).href
}

/** Resolve an official rank badge URL from rank name and optional subtier (1–6). */
export function getDeadlockRankIconUrl(
  name: string | null | undefined,
  subtier?: number | null,
): string | null {
  if (!name) return null
  const tier = RANK_TIERS[name]
  if (tier === undefined) return null

  const sub = subtier != null && subtier >= 1 && subtier <= 6 ? subtier : null
  if (sub != null) {
    return deadlockRankAsset(`rank${tier}-sub${sub}.png`)
  }
  if (tier === 0) {
    return deadlockRankAsset('rank0-sm.png')
  }
  return deadlockRankAsset(`rank${tier}-lg.webp`)
}

/**
 * Display name for a Deadlock hero key. The match watcher records `hero_<id>` (the Steam cache
 * only has the id); names come from the hero ids the stats API already sent (hero_stats,
 * recent_matches). Never shows the raw key: unknown ids read "Unknown hero".
 */
export function deadlockHeroLabel(
  key: string | null | undefined,
  known: Array<{ hero_id?: number | null; hero_name?: string | null }> | null | undefined,
): string {
  if (!key) return 'Unknown hero'
  const m = /^hero_(\d+)$/.exec(key.trim())
  if (!m) return key
  const id = Number(m[1])
  const hit = (known ?? []).find(h => h.hero_id === id && typeof h.hero_name === 'string' && h.hero_name && h.hero_name !== 'Unknown')
  return hit?.hero_name ?? 'Unknown hero'
}
