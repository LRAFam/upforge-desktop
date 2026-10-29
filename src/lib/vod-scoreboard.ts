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
    matches = puuid?.trim() ? players.filter(p => p.puuid === puuid) : []
  }
  return matches.length === 1 ? matches[0]! : null
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
