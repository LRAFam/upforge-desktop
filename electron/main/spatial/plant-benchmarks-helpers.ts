/** Rank tier resolution for spatial benchmarks (kept separate to avoid circular imports). */

export function resolvePlayerRankTier(match: {
  teamSnapshot?: Array<{ puuid?: string | null; competitiveTierName?: string }>
  puuid?: string | null
}): string | null {
  const own = match.puuid?.toLowerCase()
  if (!own) return null
  const local = match.teamSnapshot?.find((p) => p.puuid?.toLowerCase() === own)
  return local?.competitiveTierName ?? null
}
