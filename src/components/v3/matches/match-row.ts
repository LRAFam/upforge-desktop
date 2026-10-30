import type { AnalysisItem, PendingRecording } from '../../../env.d.ts'

export interface MatchRowSummary {
  /** 'win' | 'loss' only when the match data says so; null otherwise (never guessed). */
  result: 'win' | 'loss' | null
  /** "9–13" from the ally/enemy final score, or null. */
  score: string | null
  /** "11/18/3", or null when stats are missing. */
  kda: string | null
}

type RowAnalysis = Pick<AnalysisItem, 'won' | 'rounds_won' | 'rounds_lost' | 'kills' | 'deaths' | 'assists'>

/**
 * Real result data for a row: the recording's own match timeline first, then the server's analysis of
 * the same match (joined by analysis id) for rows whose timeline has no score (e.g. analysed cloud rows).
 */
export function matchRowSummary(rec: Pick<PendingRecording, 'timeline'>, analysis?: RowAnalysis | null): MatchRowSummary {
  const t = rec.timeline
  const fs = t?.finalScore
  const st = t?.finalStats
  const num = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
  let score = fs && num(fs.allyScore) && num(fs.enemyScore) ? `${fs.allyScore}–${fs.enemyScore}` : null
  let result: MatchRowSummary['result'] = null
  if (typeof st?.won === 'boolean') result = st.won ? 'win' : 'loss'
  else if (fs && fs.allyScore !== fs.enemyScore) result = fs.allyScore > fs.enemyScore ? 'win' : 'loss'
  let kda = st && [st.kills, st.deaths, st.assists].every(num) ? `${st.kills}/${st.deaths}/${st.assists}` : null
  if (analysis) {
    if (!score && num(analysis.rounds_won) && num(analysis.rounds_lost)) score = `${analysis.rounds_won}–${analysis.rounds_lost}`
    if (!result && typeof analysis.won === 'boolean') result = analysis.won ? 'win' : 'loss'
    if (!kda && [analysis.kills, analysis.deaths, analysis.assists].every(num)) kda = `${analysis.kills}/${analysis.deaths}/${analysis.assists}`
  }
  return { result, score, kda }
}

/** Storage line under the status, without repeating what the status already says (e.g. "Cloud" twice). */
export function storageLine(status: string, hasLocalFile: boolean, inCloud: boolean): string {
  const parts = [hasLocalFile ? 'On this PC' : null, inCloud ? 'Cloud' : null].filter((p): p is string => !!p)
  const s = status.trim().toLowerCase()
  return parts.filter(p => p.toLowerCase() !== s).join(' · ')
}

/** "Just now", "12m ago", "3h ago", "2d ago", then a short date. */
export function relativeTime(ms: number, now = Date.now()): string {
  if (!ms) return ''
  const mins = Math.round((now - ms) / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
