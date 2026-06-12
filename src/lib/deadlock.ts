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
  return deadlockRankAsset(`rank${tier}-lg.png`)
}
