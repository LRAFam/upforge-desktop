/** Shape a stored CS2 analysis (GET /api/cs2/analyses/{jobId}) for the in-app result view. */
import { buildCs2MatchView, type Cs2MatchView, type Cs2StatsV1 } from '../matchpage/cs2/cs2-match-view'

export interface Cs2Issue { category: string; issue: string; evidence: string; fix: string }
export interface Cs2Drill { title: string; description: string; frequency: string }
export interface Cs2Result {
  title: string
  focus: string | null
  summary: string | null
  strengths: string[]
  issues: Cs2Issue[]
  drills: Cs2Drill[]
  notes: Array<{ label: string; text: string }>
  stats: Cs2MatchView | null
  status: 'completed' | 'processing' | 'failed'
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

/** Deliberately leaves out the AI's 1–10 rating and "rank ceiling": they are opinions, not measurements. */
export function shapeCs2Result(analysis: unknown): Cs2Result | null {
  if (!analysis || typeof analysis !== 'object') return null
  const a = analysis as Record<string, unknown>
  const c = (a.coaching && typeof a.coaching === 'object' ? a.coaching : {}) as Record<string, unknown>
  const status = a.status === 'completed' ? 'completed' : a.status === 'failed' ? 'failed' : 'processing'
  const map = str(a.map)
  const score = str(a.score) ?? str((a.match_stats as Cs2StatsV1 | null)?.score)
  return {
    title: [map ? map.replace(/^de_/, '').replace(/^\w/, ch => ch.toUpperCase()) : 'CS2 match', score?.replace('-', '–')].filter(Boolean).join(' · '),
    focus: str(c.priority_focus),
    summary: str(c.overall_summary),
    strengths: arr(c.strengths).map(str).filter((s): s is string => !!s).slice(0, 5),
    issues: arr(c.key_issues).flatMap((i) => {
      const o = (i ?? {}) as Record<string, unknown>
      const issue = str(o.issue)
      return issue ? [{ category: str(o.category) ?? '', issue, evidence: str(o.evidence) ?? '', fix: str(o.fix) ?? '' }] : []
    }).slice(0, 6),
    drills: arr(c.drills).flatMap((d) => {
      const o = (d ?? {}) as Record<string, unknown>
      const title = str(o.title)
      return title ? [{ title, description: str(o.description) ?? '', frequency: str(o.frequency) ?? '' }] : []
    }).slice(0, 4),
    notes: ([['Economy', c.economy_notes], ['Utility', c.utility_notes], ['Consistency', c.mental_notes]] as const)
      .flatMap(([label, v]) => (str(v) ? [{ label, text: str(v)! }] : [])),
    stats: buildCs2MatchView((a.match_stats as Cs2StatsV1 | null) ?? null),
    status,
  }
}
