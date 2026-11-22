import { matchReportPath } from './match-report'

export interface DrillMomentMatch {
  matchId: string
  to: string
  label: string
  value: string | null
}

export interface DrillMoments {
  reviewId: number | null
  matches: DrillMomentMatch[]
}

const positiveId = (id: unknown): id is number => typeof id === 'number' && Number.isSafeInteger(id) && id > 0

/** Whether the drill listing says a source review or measured matches exist. Older APIs omit both. */
export function drillHasMoments(drill: { source?: string | null; source_analysis_id?: number | null; moment_matches?: number | null }): boolean {
  return positiveId(drill.source_analysis_id)
    || (drill.source === 'match_stats' && positiveId(drill.moment_matches))
}

/** Parse only the requested drill's owner-scoped response; paths use the desktop's report contract. */
export function parseDrillMoments(raw: unknown, drillId: number): DrillMoments | null {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Record<string, unknown>
  if (!positiveId(drillId) || data.success === false || data.drill_id !== drillId || !Array.isArray(data.matches)) return null
  const review = data.review as { analysis_id?: unknown } | null
  const reviewId = positiveId(review?.analysis_id) ? review.analysis_id : null
  const matches = data.matches.slice(0, 10).flatMap((entry): DrillMomentMatch[] => {
    if (!entry || typeof entry !== 'object') return []
    const row = entry as Record<string, unknown>
    const matchId = typeof row.match_id === 'string' ? row.match_id : ''
    if (/^(undefined|null)$/i.test(matchId)) return []
    const game = typeof row.game === 'string' ? row.game : 'valorant'
    const recordingId = typeof row.recording_id === 'string' && !/^(undefined|null)$/i.test(row.recording_id) ? row.recording_id : null
    const to = matchReportPath(game, matchId, recordingId)
    if (!to) return []
    const date = typeof row.played_at === 'string' ? new Date(row.played_at) : null
    const when = date && Number.isFinite(date.getTime()) ? date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : null
    const parts = [row.map, row.agent, when].filter((p): p is string => typeof p === 'string' && p.length > 0)
    return [{
      matchId, to, label: parts.join(' · ') || 'Match',
      value: typeof row.value_pct === 'number' && Number.isFinite(row.value_pct) ? `${Math.round(row.value_pct)}%` : null,
    }]
  })
  return { reviewId, matches }
}
