/**
 * Starting report: a new player's first AI read of their last 5–10 matches, per game.
 * The API stores one per player and game; this shapes it for the screen and decides the state.
 * Counts stay whole numbers; shares become whole percents.
 */
export type StartingGame = 'valorant' | 'lol' | 'deadlock' | 'cs2'

interface Claim { finding_id?: string; text?: string }
interface StartingReportBody {
  summary?: Claim[]
  strengths?: Claim[]
  habits?: Claim[]
  first_focus?: { metric?: string; reason?: Claim }
}
interface MetricFact { label?: string; avg?: number; best?: number; worst?: number; matches?: number; unit?: string; better?: string }
export interface StartingReportResponse {
  success?: boolean
  game?: StartingGame
  status?: 'ready' | 'insufficient' | 'none' | 'unavailable'
  matches_available?: number
  matches_used?: number | null
  report?: StartingReportBody | null
  report_source?: string | null
  facts?: { matches?: number; wins?: number; losses?: number; rank?: string | null;
    pool?: Array<{ name: string; matches: number; wins: number }>; metrics?: Record<string, MetricFact> } | null
  focus_suggestion?: { metric?: string; label?: string; better?: 'lower' | 'higher'; current?: number; target?: number; games?: number } | null
  dismissed?: boolean
  generated_at?: string | null
}

export type StartingReportView =
  | { kind: 'ready'; title: string; record: string; summary: string[]; strengths: string[]; habits: string[];
    pool: string[]; stats: Array<{ label: string; value: string }>; focus: { label: string; reason: string; target: string | null; canStart: boolean } | null;
    next: string }
  | { kind: 'insufficient'; available: number; needed: number }
  | { kind: 'none' }

const MIN = 3
const NEXT = 'Your next matches get coached automatically: a match report after every game, and your focus is checked over the next 3 games.'

function texts(list: Claim[] | undefined): string[] {
  return (list ?? []).map(c => (typeof c?.text === 'string' ? c.text.trim() : '')).filter(Boolean)
}

export function formatMetric(m: MetricFact | undefined, v: number | undefined): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—'
  if (m?.unit === 'share') return `${Math.round(v * 100)}%`
  if (m?.unit === 'seconds') return `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, '0')}`
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function startingReportView(res: StartingReportResponse | null | undefined): StartingReportView {
  if (!res || res.status === 'none' || res.status === 'unavailable') return { kind: 'none' }
  if (res.status === 'insufficient' || !res.report) {
    return { kind: 'insufficient', available: Math.max(0, res.matches_available ?? res.matches_used ?? 0), needed: MIN }
  }
  const f = res.facts ?? {}
  const n = f.matches ?? res.matches_used ?? 0
  const metrics = f.metrics ?? {}
  const focusKey = res.report.first_focus?.metric ?? res.focus_suggestion?.metric
  const focusMetric = focusKey ? metrics[focusKey] : undefined
  const sugg = res.focus_suggestion
  return {
    kind: 'ready',
    title: `How you play right now`,
    record: `${plural(n, 'match', 'matches')} · ${plural(f.wins ?? 0, 'win', 'wins')} · ${plural(f.losses ?? 0, 'loss', 'losses')}`,
    summary: texts(res.report.summary),
    strengths: texts(res.report.strengths).slice(0, 2),
    habits: texts(res.report.habits).slice(0, 2),
    pool: (f.pool ?? []).map(p => `${p.name} · ${plural(p.matches, 'match', 'matches')}`),
    stats: Object.values(metrics).slice(0, 6).map(m => ({ label: m.label ?? '', value: formatMetric(m, m.avg) })).filter(s => s.label),
    focus: focusKey ? {
      label: focusMetric?.label ?? sugg?.label ?? focusKey,
      reason: res.report.first_focus?.reason?.text ?? '',
      target: sugg && sugg.metric === focusKey && typeof sugg.target === 'number'
        ? `Aim for ${sugg.better === 'lower' ? 'at most' : 'at least'} ${formatMetric(focusMetric, sugg.target)} over your next ${sugg.games ?? 3} games`
        : null,
      canStart: (res.game === 'valorant' || res.game === 'lol') && !!sugg && sugg.metric === focusKey,
    } : null,
    next: NEXT,
  }
}

/** The Home card shows during the first week after the report, until dismissed. */
export function showStartingCard(res: StartingReportResponse | null | undefined, now = Date.now()): boolean {
  if (!res || res.dismissed || res.status !== 'ready' || !res.generated_at) return false
  const at = Date.parse(res.generated_at)
  return Number.isFinite(at) && now - at < 7 * 24 * 3600 * 1000
}

export function loadingLine(game: StartingGame): string {
  return game === 'cs2' ? 'Reading the demos from your last matches…' : 'Reading your last 10 matches…'
}
