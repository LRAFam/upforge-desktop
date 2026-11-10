import { recoveredMatchStartAligns } from './match-details-validation'

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

/**
 * Latest-match fallback: only accept a history entry whose game start aligns with
 * this recording (±10 min). Right after a match Riot history often still lists the
 * previous game first — attaching it would put the wrong match's stats on this VOD.
 */
export function pickHistoryMatchIdForRecording(
  history: RiotMatchHistoryEntry[],
  recordingStartMs: number,
): string | null {
  let best: { matchId: string; diff: number } | null = null
  for (const entry of history) {
    if (entry.gameStartTimeMs == null) continue
    if (!recoveredMatchStartAligns(recordingStartMs, entry.gameStartTimeMs)) continue
    const diff = Math.abs(entry.gameStartTimeMs - recordingStartMs)
    if (!best || diff < best.diff) best = { matchId: entry.matchId, diff }
  }
  return best?.matchId ?? null
}
