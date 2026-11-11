import type { TeamPlayerSnapshot } from '../../electron/main/riot-types'

/** Identity belongs to this recording, never to the currently signed-in game account. */
export function resolveScoreboardPlayer(
  players: TeamPlayerSnapshot[], game: string | null, puuid: string | null, recordedName: string | null,
): TeamPlayerSnapshot | null {
  let matches: TeamPlayerSnapshot[]
  if (game === 'lol') {
    // Legacy recordings predate the explicit Live Client / Match-V5 identity flag.
    // Their captured finalStats.summonerName is the only supported migration source.
    matches = players.some(p => typeof p.isLocalPlayer === 'boolean')
      ? players.filter(p => p.isLocalPlayer === true)
      : recordedName?.trim() ? players.filter(p => p.summonerName === recordedName) : []
  } else {
    const want = puuid?.trim().toLowerCase()
    matches = want ? players.filter(p => p.puuid?.toLowerCase() === want) : []
  }
  return matches.length === 1 ? matches[0]! : null
}

/**
 * Fallback when the player's own row can't be found: the team whose round wins equal the
 * recorded ally score. Null when the score is missing, a draw, or matches no team exactly.
 */
export function inferOwnTeamFromScore(
  summaries: ReadonlyArray<{ winningTeam: string | null }>,
  finalScore: { allyScore: number; enemyScore: number } | null | undefined,
): string | null {
  if (!finalScore || finalScore.allyScore === finalScore.enemyScore) return null
  const wins = new Map<string, number>()
  for (const s of summaries) {
    if (s.winningTeam) wins.set(s.winningTeam, (wins.get(s.winningTeam) ?? 0) + 1)
  }
  const matches = [...wins].filter(([, n]) => n === finalScore.allyScore)
  return matches.length === 1 ? matches[0]![0] : null
}

/** The recording player's team: scoreboard row, then the stored final-stats team, then the score. */
export function resolveOwnTeam(
  scoreboardTeam: string | null | undefined,
  finalStatsTeam: string | null | undefined,
  summaries: ReadonlyArray<{ winningTeam: string | null }>,
  finalScore: { allyScore: number; enemyScore: number } | null | undefined,
): string | null {
  return scoreboardTeam || finalStatsTeam || inferOwnTeamFromScore(summaries, finalScore)
}

export function groupScoreboardPlayers(players: TeamPlayerSnapshot[], own: TeamPlayerSnapshot | null) {
  const teams = [...new Set(players.map(p => p.team))]
  const knownTeam = own?.team && own.team !== 'UNKNOWN' ? own.team : null
  if (knownTeam) teams.sort((a, b) => Number(b === knownTeam) - Number(a === knownTeam))
  return teams.map(team => ({
    label: knownTeam ? (team === knownTeam ? 'Allies' : team === 'UNKNOWN' ? 'Unknown team' : 'Enemies') : `Team ${team}`,
    isAlly: knownTeam ? team === knownTeam : null,
    players: players.filter(p => p.team === team),
  }))
}

export function formatScoreboardStat(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value.toLocaleString('en-GB') : '—'
}
