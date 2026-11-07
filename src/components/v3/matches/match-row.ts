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

/**
 * The ONE quiet storage line under the Matches/Clips header:
 * "30 recordings · 36.10 GB cloud storage used" (+ "· 2.1 GB on this PC" only when there is some).
 * Cloud storage is account-wide (every game, clips and recordings), so it is named as such.
 */
export function storageSummary(opts: { count: number; noun: [string, string]; localBytes?: string | null; cloudUsed?: string | null; cloudCapacity?: string | null; full?: boolean }): string {
  const parts = [`${opts.count} ${opts.count === 1 ? opts.noun[0] : opts.noun[1]}`]
  if (opts.localBytes) parts.push(`${opts.localBytes} on this PC`)
  if (opts.full) parts.push('cloud storage full')
  else if (opts.cloudUsed) parts.push(`${opts.cloudUsed}${opts.cloudCapacity ? ` of ${opts.cloudCapacity}` : ''} cloud storage used`)
  return parts.join(' · ')
}

/**
 * The row's one cloud line (status column): a countdown that opens "Keep it in the cloud",
 * "Save to cloud" for a match only on this PC, or "Full video no longer stored". null = nothing to add.
 * `line` comes from `retentionLine(parseRetention(rec.cloudFile?.retention))`.
 */
export type RowCloudAction =
  | { kind: 'keep'; text: string; warn: boolean; detail: string | null }
  | { kind: 'save'; text: string }
  | { kind: 'removed'; text: string }
export function rowCloudAction(
  rec: Pick<PendingRecording, 'hasLocalFile' | 'archiveId' | 'cloudUploaded' | 'pipelineStatus'> & { cloudOnly?: boolean },
  line: import('../../../lib/cloud-retention').RetentionLine | null,
): RowCloudAction | null {
  // A keep time (no removal date yet) is said softly, with the action in the same line.
  if (line?.keepTime) return { kind: 'keep', text: `${line.text} · Keep it in the cloud`, warn: false, detail: line.detail }
  if (line?.countdown) return { kind: 'keep', text: line.text, warn: line.tone === 'warn', detail: line.detail }
  // Removed with a copy on this PC: the PC copy still plays, so the row stays quiet.
  if (line?.removed) return rec.hasLocalFile ? null : { kind: 'removed', text: line.text }
  const inCloud = !!rec.archiveId || !!rec.cloudUploaded || !!rec.cloudOnly
  if (rec.hasLocalFile && !inCloud && !rec.pipelineStatus) return { kind: 'save', text: 'Save to cloud' }
  return null
}

/**
 * The row's main button. A match the AI has coached says so ("AI coaching") so players can find
 * what the coach said; a recording without coaching stays "Review" (timeline) or "Watch" (video only).
 */
export function rowOpenAction(rec: { analysisId?: number | null; cloudOnly?: boolean }, opts: { unavailable: boolean; timeline: boolean }): {
  label: string; icon: 'notes' | 'map' | 'play'; ai: boolean; title: string
} {
  if (!opts.unavailable && rec.analysisId != null) {
    return { label: 'AI coaching', icon: 'notes', ai: true, title: 'Read what the AI coach said about this match' }
  }
  const review = opts.unavailable || rec.cloudOnly || opts.timeline
  return review
    ? { label: 'Review', icon: 'map', ai: false, title: 'Open the match timeline' }
    : { label: 'Watch', icon: 'play', ai: false, title: 'Watch the recording' }
}
