import type { ClipRecord } from '../env.d.ts'

export interface SessionClipFilterOpts {
  matchId?: string | null
  agent?: string | null
  sessionStart?: number
}

/**
 * Clips belonging to the current match — mirrors main-process countSessionClips().
 * Prefer matchId; fall back to agent + time window around sessionStart.
 */
export function filterSessionClips(
  clips: ClipRecord[],
  opts: SessionClipFilterOpts,
): ClipRecord[] {
  const matchId = opts.matchId ?? null
  const agent = opts.agent ?? null
  const sessionStart = opts.sessionStart ?? 0
  const windowStart = sessionStart > 0
    ? sessionStart - 60_000
    : Date.now() - 15 * 60 * 1000

  if (matchId) {
    return clips.filter((c) => c.matchId === matchId)
  }

  return clips.filter((c) => {
    if (agent && c.agent === agent && c.savedAt >= windowStart) return true
    return false
  })
}
