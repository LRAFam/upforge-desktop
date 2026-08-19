export interface RiotMatchHistoryEntry {
  matchId: string
  /** Canonical source: History[].GameStartTimeMillis. */
  gameStartTimeMs: number | null
}

export function parseRiotMatchHistory(payload: unknown): RiotMatchHistoryEntry[] {
  if (!payload || typeof payload !== 'object') return []
  const history = (payload as { History?: unknown }).History
  if (!Array.isArray(history)) return []

  return history.flatMap((raw): RiotMatchHistoryEntry[] => {
    if (!raw || typeof raw !== 'object') return []
    const entry = raw as { MatchID?: unknown; GameStartTimeMillis?: unknown }
    if (typeof entry.MatchID !== 'string' || entry.MatchID.length === 0) return []
    return [{
      matchId: entry.MatchID,
      gameStartTimeMs: typeof entry.GameStartTimeMillis === 'number'
        && Number.isFinite(entry.GameStartTimeMillis)
        ? entry.GameStartTimeMillis
        : null,
    }]
  })
}
