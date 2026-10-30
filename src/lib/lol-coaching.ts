/**
 * League Riot-stats coaching (path A) shaped for the desktop match page and Coaching reviews.
 * Reads the `/api/lol/analyses/{id}` payload; never invents a field the AI did not return.
 */

export interface LolCoachingView {
  status: 'ready' | 'working' | 'failed'
  summary: string | null
  focus: string | null
  rankLabel: string | null
  improvements: Array<{ theme: string; issue: string; fix: string }>
  strengths: string[]
  moments: Array<{ timestamp: string; title: string; note: string }>
  drills: Array<{ title: string; description: string; frequency: string | null }>
  lane: Array<{ minute: string; text: string }>
  error: string | null
}

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null)
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const signed = (n: number) => (n > 0 ? `+${n}` : String(n))

export function lolCoachingView(detail: unknown): LolCoachingView | null {
  const d = obj(detail)
  if (!d) return null
  const status = d.status === 'completed' ? 'ready' : d.status === 'failed' ? 'failed' : 'working'
  const result = obj(d.analysis_result)
  const coaching = obj(result?.coaching) ?? obj(obj(d.partial_result)?.coaching)
  const matchData = obj(d.match_data) ?? obj(obj(d.partial_result)?.match_data)

  const lane: LolCoachingView['lane'] = []
  const lm = obj(matchData?.lane_metrics)
  const opp = str(lm?.opponent_champion)
  for (const minute of ['10', '15']) {
    const e = obj(obj(lm?.at)?.[minute])
    if (!e || typeof e.cs !== 'number') continue
    const cmp = opp && typeof e.opponent_cs === 'number' && typeof e.gold_diff === 'number'
      ? ` vs ${e.opponent_cs} (${opp}) · gold ${signed(e.gold_diff as number)}${typeof e.xp_diff === 'number' ? ` · XP ${signed(e.xp_diff)}` : ''}`
      : ''
    lane.push({ minute: `${minute}:00`, text: `CS ${e.cs}${cmp}` })
  }

  return {
    status,
    summary: str(coaching?.summary),
    focus: str(coaching?.priority_focus),
    rankLabel: str(matchData?.rank_at_match),
    improvements: arr(coaching?.priority_improvements).map(obj).filter((x): x is Obj => !!x)
      .map(x => ({ theme: str(x.theme) ?? '', issue: str(x.issue) ?? '', fix: str(x.fix) ?? '' }))
      .filter(x => x.issue || x.fix),
    strengths: arr(coaching?.strengths).map(str).filter((x): x is string => !!x),
    moments: arr(coaching?.moments).map(obj).filter((x): x is Obj => !!x)
      .map(x => ({ timestamp: str(x.timestamp) ?? '', title: str(x.title) ?? '', note: str(x.coaching_note) ?? '' }))
      .filter(x => x.title || x.note),
    drills: arr(coaching?.drills).map(obj).filter((x): x is Obj => !!x)
      .map(x => ({ title: str(x.title) ?? '', description: str(x.description) ?? '', frequency: str(x.frequency) }))
      .filter(x => x.title),
    lane,
    error: status === 'failed' ? str(d.error) : null,
  }
}

/**
 * The newest analysis row for a Riot match id (rows are newest first from the API).
 * Some recordings only captured the numeric game id (live client); those match the numeric part
 * of a Match-V5 id. A region-prefixed id must match exactly, so ids never link across regions.
 */
export function analysisForMatch<T extends { match_id: string; id: number }>(rows: T[], matchId: string | null | undefined): T | null {
  if (!matchId) return null
  const id = matchId.trim().toUpperCase()
  const exact = rows.find(r => r.match_id?.toUpperCase() === id)
  if (exact || !/^\d+$/.test(id)) return exact ?? null
  return rows.find(r => r.match_id?.toUpperCase().split('_')[1] === id) ?? null
}
