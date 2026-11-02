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
    pool: string[]; stats: StartingStat[]; focus: { label: string; reason: string; target: string | null; canStart: boolean } | null;
    next: string }
  | { kind: 'insufficient'; available: number; needed: number }
  | { kind: 'none' }

/**
 * One "Your numbers" row. `bar` (0–1 positions on the row's own scale) draws the player's own
 * worst↔best spread with the average marked — there is no rank average in the API response, so
 * nothing is compared against an invented benchmark.
 */
export interface StartingStat {
  label: string
  value: string
  range: string | null
  bar: { avg: number; lo: number; hi: number } | null
}

const MIN = 3
const NEXT = 'Your next matches get coached automatically: a match report after every game, and your focus is checked over the next 3 games.'

function texts(list: Claim[] | undefined): string[] {
  return (list ?? []).map(c => (typeof c?.text === 'string' ? c.text.trim() : '')).filter(Boolean)
}

export function formatMetric(m: MetricFact | undefined, v: number | undefined): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—'
  if (m?.unit === 'share') return `${Math.round(v * 100)}%`
  if (m?.unit === 'seconds') return `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, '0')}`
  // Big counts (Deadlock souls, damage) read as whole numbers with separators: "24,305", not "24304.8".
  if (Math.abs(v) >= 1000) return Math.round(v).toLocaleString('en-GB')
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/**
 * The AI sometimes writes share metrics as raw decimals ("averages 0.141", "worst of 0.312").
 * Rewrite only decimals that match one of this report's share values (avg / best / worst /
 * focus target) as whole percents, so the sentences agree with "Your numbers". Nothing else
 * in the sentence changes.
 */
export function sharesAsPercents(text: string, shares: readonly number[]): string {
  if (!shares.length) return text
  return text.replace(/(^|[^\d.])(0?\.\d{1,4})(?![\d%])/g, (whole, pre: string, num: string) => {
    const v = Number(num)
    const decimals = num.split('.')[1].length
    const tol = 0.5 * 10 ** -decimals + 1e-9
    return shares.some(s => Math.abs(s - v) <= tol) ? `${pre}${Math.round(v * 100)}%` : whole
  })
}

function shareValues(metrics: Record<string, MetricFact>, extra: Array<number | undefined>): number[] {
  const out: number[] = []
  for (const m of Object.values(metrics)) {
    if (m?.unit !== 'share') continue
    for (const v of [m.avg, m.best, m.worst]) if (finite(v)) out.push(v)
  }
  for (const v of extra) if (finite(v) && v > 0 && v < 1) out.push(v)
  return out
}

/** Row for "Your numbers": value, the player's own worst–best, and a bar on that metric's scale. */
export function startingStat(m: MetricFact): StartingStat {
  const value = formatMetric(m, m.avg)
  const hasRange = finite(m.best) && finite(m.worst)
  const range = hasRange ? `worst ${formatMetric(m, m.worst)} · best ${formatMetric(m, m.best)}` : null
  let bar: StartingStat['bar'] = null
  if (finite(m.avg) && hasRange) {
    // Shares sit on 0–100%; counts on 0 → the player's own highest value.
    const max = m.unit === 'share' ? 1 : Math.max(m.best as number, m.worst as number, m.avg)
    if (max > 0) {
      const pos = (v: number) => Math.min(1, Math.max(0, v / max))
      bar = { avg: pos(m.avg), lo: pos(Math.min(m.best as number, m.worst as number)), hi: pos(Math.max(m.best as number, m.worst as number)) }
    }
  }
  // Seconds are shown as m:ss, so a "(seconds)" unit in the label would contradict the value.
  const label = m.unit === 'seconds' ? (m.label ?? '').replace(/\s*\(seconds\)\s*$/i, '') : m.label ?? ''
  return { label, value, range, bar }
}

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
  const shares = shareValues(metrics, [sugg?.current, sugg?.target])
  const said = (list: Claim[] | undefined) => texts(list).map(t => sharesAsPercents(t, shares))
  return {
    kind: 'ready',
    title: `How you play right now`,
    record: `${plural(n, 'match', 'matches')} · ${plural(f.wins ?? 0, 'win', 'wins')} · ${plural(f.losses ?? 0, 'loss', 'losses')}`,
    summary: said(res.report.summary),
    strengths: said(res.report.strengths).slice(0, 2),
    habits: said(res.report.habits).slice(0, 2),
    pool: (f.pool ?? []).map(p => `${p.name} · ${plural(p.matches, 'match', 'matches')}`),
    stats: Object.values(metrics).slice(0, 6).map(startingStat).filter(s => s.label),
    focus: focusKey ? {
      label: focusMetric?.label ?? sugg?.label ?? focusKey,
      reason: sharesAsPercents(res.report.first_focus?.reason?.text ?? '', shares),
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

/**
 * "Not enough matches" line. CS2 is different: the API can't fetch CS2 matches, so the report reads
 * demos parsed on this PC (main sends at most 10), and only recorded matches get a parsed demo.
 */
export function insufficientLine(game: StartingGame, available: number, needed: number): string {
  const more = Math.max(1, needed - available)
  if (game === 'cs2') {
    return `Your CS2 report reads match demos parsed on this PC, and it needs ${needed}. ${available === 0 ? 'None are ready yet' : `${available} ${available === 1 ? 'is' : 'are'} ready`}. Record ${more === 1 ? '1 more CS2 match' : `${more} more CS2 matches`} with UpForge open; each demo is read after the match.`
  }
  return `We found ${plural(available, 'match', 'matches')}. Play ${more === 1 ? '1 more' : `${more} more`} and your starting report is written automatically.`
}
