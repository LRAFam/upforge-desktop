export interface RoundKillMeta {
  round: number
  attackerUserId: number
  victimUserId: number
  attackerTeam: number
  victimTeam: number
}

export interface InferredLocalPlayer {
  userId: number
  team: number
  name: string
}

/** When name matching fails, pick the player with the most kills (solo-queue heuristic). */
export function inferLocalPlayerFromDemoKills(
  roundKills: RoundKillMeta[],
  resolveName: (userId: number) => string,
): InferredLocalPlayer | null {
  const killCounts = new Map<number, number>()
  const teamByUser = new Map<number, number>()

  for (const kill of roundKills) {
    if (kill.attackerUserId <= 0) continue
    killCounts.set(kill.attackerUserId, (killCounts.get(kill.attackerUserId) ?? 0) + 1)
    teamByUser.set(kill.attackerUserId, kill.attackerTeam)
    if (kill.victimUserId > 0) teamByUser.set(kill.victimUserId, kill.victimTeam)
  }

  let bestUserId: number | null = null
  let bestKills = 0
  for (const [userId, count] of killCounts) {
    if (count > bestKills) {
      bestKills = count
      bestUserId = userId
    }
  }

  if (bestUserId == null || bestKills === 0) return null

  const team = teamByUser.get(bestUserId) ?? 0
  return {
    userId: bestUserId,
    team,
    name: resolveName(bestUserId),
  }
}
