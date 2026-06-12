/** Official Deadlock rank badge URLs from the community assets API. */
const RANK_ASSETS = 'https://assets-bucket.deadlock-api.com/assets-api-res/images/ranks'

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
    return `${RANK_ASSETS}/rank${tier}/badge_sm_subrank${sub}.png`
  }
  return `${RANK_ASSETS}/rank${tier}/badge_sm.png`
}
