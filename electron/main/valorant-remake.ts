/**
 * Valorant remakes: a team votes to remake after a round-1 disconnect, so the match ends after
 * one or two rounds. Riot's completionState value for a remake is not confirmed ("VoteDraw" may
 * also be the overtime draw vote), so the rule only trusts round count: no legal round-based
 * finish is under 3 rounds except a surrender, which Riot marks as "Surrendered".
 */

/** Modes with no rounds (or rounds that don't follow the 13-win structure): never remakes. */
const NON_ROUND_MODES = new Set(['DEATHMATCH', 'TEAMDEATHMATCH', 'ESCALATION', 'SNOWBALL', 'THE RANGE'])

export interface RemakeInput {
  game?: string | null
  gameMode?: string | null
  completionState?: string | null
  roundSummaries?: unknown[] | null
}

export function isValorantRemake(t: RemakeInput | null | undefined): boolean {
  if (!t || (t.game && t.game !== 'valorant')) return false
  if ((t.completionState ?? '').toLowerCase() === 'surrendered') return false
  if (NON_ROUND_MODES.has((t.gameMode ?? '').toUpperCase())) return false
  const rounds = t.roundSummaries?.length ?? 0
  return rounds > 0 && rounds < 3
}
