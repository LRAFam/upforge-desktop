import type { MatchData, DerivedMatchScore } from './riot-types'

export type { DerivedMatchScore }

/** Count round wins from Riot roundSummaries (authoritative — first to 13, OT win-by-2). */
export function deriveMatchScoreFromSummaries(
  roundSummaries: MatchData['roundSummaries'],
  playerTeam: string | null | undefined,
): DerivedMatchScore | null {
  if (!roundSummaries?.length || !playerTeam) return null
  const team = playerTeam.toUpperCase()
  let allyScore = 0
  let enemyScore = 0
  for (const r of roundSummaries) {
    const winner = r.winningTeam?.toUpperCase()
    if (!winner) continue
    if (winner === team) allyScore++
    else enemyScore++
  }
  if (allyScore + enemyScore === 0) return null
  return { allyScore, enemyScore }
}

export function deriveMatchScore(timeline: MatchData): DerivedMatchScore | null {
  return deriveMatchScoreFromSummaries(
    timeline.roundSummaries,
    timeline.finalStats?.team,
  )
}
