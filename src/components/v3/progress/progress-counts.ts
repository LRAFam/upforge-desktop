/**
 * Honest counts for the v3 Progress header. The screen draws from three sources that count different
 * things, so the header names both counts instead of one number that contradicts the chart:
 * - rank line: rank snapshots (polled ~every 30 min, NOT one per game, so never counted as games);
 * - habit trends: per-match snapshots the coach checks for every synced game (focus history);
 * - "Analysed matches": full UpForge analyses (`created_at` in range).
 */
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/**
 * "14 games checked · 0 analysed" — or just "0 analysed matches" when the checked games aren't known.
 * Checked games are Valorant focus checks, so every other game shows only its analysed count.
 */
export function progressCountLine(checkedGames: number | null, analysed: number, game: string = 'valorant'): string {
  if (checkedGames == null || game !== 'valorant') return `${plural(analysed, 'analysed match', 'analysed matches')} in this range`
  return `${plural(checkedGames, 'game')} checked · ${analysed} analysed`
}

/** Empty line for "Analysed matches": says when the last one was, so an empty range doesn't read as "no data". */
export function analysedEmptyLine(lastAnalysedAt: string | null, now = Date.now()): string {
  const t = lastAnalysedAt ? Date.parse(lastAnalysedAt) : Number.NaN
  if (!Number.isFinite(t)) return 'No analysed matches yet. Play a match with recording on to get one.'
  const days = Math.max(0, Math.floor((now - t) / 86_400_000))
  const ago = days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`
  return `No analysed matches in this range. Your last one was ${ago}; pick a longer range to see it.`
}
