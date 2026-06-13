/**
 * Resolve spike plant world coordinates from a Riot roundResults row.
 * Prefers plantLocation; falls back to the planter's plantPlayerLocations entry.
 */
export function resolvePlantLocationFromRound(
  round: Record<string, unknown>,
  planterPuuid?: string | null,
): { x: number; y: number } | undefined {
  const plantLocRaw = round.plantLocation as { x?: number; y?: number } | null | undefined
  if (plantLocRaw?.x != null && plantLocRaw?.y != null) {
    return { x: plantLocRaw.x, y: plantLocRaw.y }
  }

  const playerLocs = round.plantPlayerLocations as Array<{
    puuid?: string
    x?: number
    y?: number
  }> | undefined
  if (!playerLocs?.length) return undefined

  if (planterPuuid) {
    const lower = planterPuuid.toLowerCase()
    const planter = playerLocs.find((p) => p.puuid?.toLowerCase() === lower)
    if (planter?.x != null && planter?.y != null) {
      return { x: planter.x, y: planter.y }
    }
  }

  const valid = playerLocs.filter((p) => p.x != null && p.y != null)
  if (!valid.length) return undefined
  if (valid.length === 1) return { x: valid[0].x!, y: valid[0].y! }

  const x = valid.reduce((sum, p) => sum + p.x!, 0) / valid.length
  const y = valid.reduce((sum, p) => sum + p.y!, 0) / valid.length
  return { x, y }
}
