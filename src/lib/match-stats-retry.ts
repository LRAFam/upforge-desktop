/**
 * Whether the dashboard should offer a manual Riot match-stats sync retry.
 * Used when Analyse would otherwise stay locked forever after the auto-sync window.
 */
export function canRetryRiotMatchStats(rec: {
  game?: string | null
  analysisReadiness?: { state?: string } | null
}): boolean {
  if (rec.game !== 'valorant' && rec.game !== 'lol') return false
  const state = rec.analysisReadiness?.state
  return state === 'waiting_match_data' || state === 'syncing' || state === 'unavailable'
}
