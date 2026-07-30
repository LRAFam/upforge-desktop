/**
 * Resolve Valorant game region for PD / MatchDetails.
 * Chat session region is Riot chat affinity (eu2, la1, …), not always the game shard.
 */

const VALORANT_REGIONS = new Set(['na', 'latam', 'br', 'eu', 'ap', 'kr'])

export type ValorantRegionSource = 'deployment' | 'account' | 'chat'

export interface ResolveValorantRegionInput {
  deploymentRegion?: string | null
  accountRegion?: string | null
  chatRegion?: string | null
}

export interface ResolvedValorantRegion {
  region: string
  source: ValorantRegionSource
}

/**
 * Normalize a raw Riot / UpForge region string to a Valorant region id.
 * Returns null for unknown values (do not invent a shard).
 */
export function normalizeValorantRegion(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const r = String(raw).trim().toLowerCase()
  if (!r) return null

  // EU chat affinities: eu, eu2, euw, euw1, eun, …
  if (r.startsWith('eu')) return 'eu'

  // Explicit LAN/LAS chat affinities — only used if chat is the chosen source.
  if (r === 'la1' || r === 'la2' || r === 'lan' || r === 'las') return 'latam'

  if (r === 'ko') return 'kr'
  if (r === 'pbe') return 'na'

  const stripped = r.replace(/\d+$/, '')
  if (VALORANT_REGIONS.has(stripped)) return stripped
  if (VALORANT_REGIONS.has(r)) return r

  // Bare "la" is ambiguous chat junk — do not treat as latam here.
  return null
}

/**
 * Prefer Valorant launch affinity, then linked UpForge account region, then chat.
 */
export function resolveValorantGameRegion(
  input: ResolveValorantRegionInput,
): ResolvedValorantRegion | null {
  const candidates: Array<{ raw: string | null | undefined; source: ValorantRegionSource }> = [
    { raw: input.deploymentRegion, source: 'deployment' },
    { raw: input.accountRegion, source: 'account' },
    { raw: input.chatRegion, source: 'chat' },
  ]

  for (const candidate of candidates) {
    const region = normalizeValorantRegion(candidate.raw)
    if (!region) continue
    // Chat-only la1/la2 → latam is allowed as last resort; bare rejected above.
    return { region, source: candidate.source }
  }

  return null
}
