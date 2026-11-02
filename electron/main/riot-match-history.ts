export interface RiotMatchHistoryEntry {
  matchId: string
  /** Canonical source: History[].GameStartTimeMillis. */
  gameStartTimeMs: number | null
  /** History[].QueueID, e.g. competitive, unrated, swiftplay, premier, custom ('' for customs). */
  queueId?: string
}

export function parseRiotMatchHistory(payload: unknown): RiotMatchHistoryEntry[] {
  if (!payload || typeof payload !== 'object') return []
  const history = (payload as { History?: unknown }).History
  if (!Array.isArray(history)) return []

  return history.flatMap((raw): RiotMatchHistoryEntry[] => {
    if (!raw || typeof raw !== 'object') return []
    const entry = raw as { MatchID?: unknown; GameStartTimeMillis?: unknown; QueueID?: unknown }
    if (typeof entry.MatchID !== 'string' || entry.MatchID.length === 0) return []
    return [{
      matchId: entry.MatchID,
      gameStartTimeMs: typeof entry.GameStartTimeMillis === 'number'
        && Number.isFinite(entry.GameStartTimeMillis)
        ? entry.GameStartTimeMillis
        : null,
      queueId: typeof entry.QueueID === 'string' ? entry.QueueID : undefined,
    }]
  })
}
