/**
 * Match report (free, data-only, after every match). Shapes the stored API report
 * (GET /api/match-report/{id}) into what the v3 screen shows. Pure: no network, real data only.
 */
import type { Focus, NoteClaim } from './focus'

export interface MatchReportFacts {
  map?: string | null
  agent?: string | null
  mode?: string | null
  won?: boolean | null
  score?: { ally: number; enemy: number } | null
  kda?: { kills?: number | null; deaths?: number | null; assists?: number | null } | null
  acs?: number | null
  adr?: number | null
  headshot_pct?: number | null
  lobby_rank?: number | null
  lobby_size?: number | null
  first_death_rounds?: number[]
  first_kill_rounds?: number[]
  zero_damage_rounds?: number[]
  multi_kill_rounds?: Array<{ n: number; kills: number }>
  deaths?: { total?: number; traded?: number; untraded?: number; unknown?: number } | null
  opening_impact?: { first_kills?: number; first_kill_wins?: number; first_deaths?: number; first_death_wins?: number } | null
}

export interface MatchReportNotes { headline?: NoteClaim; subline?: NoteClaim; next_action?: NoteClaim; positive?: NoteClaim | null }

export interface MatchReportResponse {
  success?: boolean
  match_id: string
  played_at?: string | null
  account?: { is_main: boolean } | null
  report?: { facts?: MatchReportFacts; notes?: MatchReportNotes | null; notes_source?: string | null } | null
  focus?: Focus | null
  focus_check?: { match_id: string; value: number; hit: boolean } | null
  notes_usage?: { used: number; limit: number } | null
}

export type MatchReportState =
  | { kind: 'ready'; view: MatchReportView }
  | { kind: 'not_found' }
  | { kind: 'unsupported'; game: string }
  | { kind: 'error' }

export interface FactRow { label: string; value: string }
export interface NextStep { text: string; drillMetric: string | null }

export interface MatchReportView {
  matchId: string
  /** Which game the report is for (League, Deadlock and CS2 are built in match-report-games.ts). */
  game?: 'valorant' | 'lol' | 'deadlock' | 'cs2'
  /** Label above the headline: Valorant's checked coach note "decides" it; other games show a measured key number. */
  headlineLabel?: string
  /** Hero-band meta for games without map/agent art, e.g. "Ahri · Mid · 31:04". */
  metaLine?: string | null
  result: 'win' | 'loss' | null
  score: string | null
  map: string | null
  agent: string | null
  headline: string | null
  subline: string | null
  positive: string | null
  /** True when the coach notes were left out because today's free notes are used up. */
  notesCapped: boolean
  facts: FactRow[]
  focusCheck: { label: string; hit: boolean } | null
  nextSteps: NextStep[]
  isAlt: boolean
}

/** Coach finding → focus metric, so a next step can open the matching drills. */
const FINDING_METRIC: Record<string, string> = {
  opening_deaths: 'opening_death_rate',
  early_opening_deaths: 'early_opening_death_rate',
  trades: 'traded_death_rate',
  zero_damage: 'zero_damage_round_rate',
  headshots: 'headshot_hit_rate',
  leg_hits: 'leg_hit_rate',
}

const n = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`

export function matchReportFactRows(f: MatchReportFacts | undefined | null): FactRow[] {
  if (!f) return []
  const rows: FactRow[] = []
  if (f.kda && n(f.kda.kills) && n(f.kda.deaths) && n(f.kda.assists)) rows.push({ label: 'K / D / A', value: `${f.kda.kills} / ${f.kda.deaths} / ${f.kda.assists}` })
  if (n(f.acs)) rows.push({ label: 'Combat score', value: String(Math.round(f.acs)) })
  if (n(f.adr)) rows.push({ label: 'Damage per round', value: String(Math.round(f.adr)) })
  if (n(f.lobby_rank) && n(f.lobby_size) && f.lobby_size > 0) rows.push({ label: 'Lobby rank', value: `${f.lobby_rank} of ${f.lobby_size}` })
  const o = f.opening_impact
  if (o && n(o.first_kills) && n(o.first_deaths)) {
    rows.push({ label: 'Opening duels', value: `${plural(o.first_kills, 'first kill')}, ${plural(o.first_deaths, 'first death')}` })
    if (n(o.first_deaths) && o.first_deaths > 0 && n(o.first_death_wins)) rows.push({ label: 'Rounds won after dying first', value: `${o.first_death_wins} of ${o.first_deaths}` })
  }
  const d = f.deaths
  if (d && n(d.total) && n(d.traded) && d.total > 0) rows.push({ label: 'Deaths traded', value: `${d.traded} of ${d.total}` })
  if (Array.isArray(f.zero_damage_rounds)) rows.push({ label: 'Rounds with no damage', value: String(f.zero_damage_rounds.length) })
  return rows
}

export function matchReportView(res: MatchReportResponse): MatchReportView {
  const facts = res.report?.facts ?? null
  const notes = res.report?.notes ?? null
  const usage = res.notes_usage
  const nextSteps: NextStep[] = []
  if (notes?.next_action?.text) nextSteps.push({ text: notes.next_action.text, drillMetric: FINDING_METRIC[notes.next_action.finding_id] ?? null })
  const focus = res.focus ?? null
  if (focus && focus.progress?.status === 'active' && nextSteps.length < 3) {
    nextSteps.push({ text: `Keep working on your focus: ${focus.label}.`, drillMetric: (focus as unknown as { metric?: string }).metric ?? null })
  }
  return {
    matchId: res.match_id,
    game: 'valorant',
    headlineLabel: 'What decided it',
    metaLine: null,
    result: facts?.won == null ? null : facts.won ? 'win' : 'loss',
    score: facts?.score && n(facts.score.ally) && n(facts.score.enemy) ? `${facts.score.ally}–${facts.score.enemy}` : null,
    map: facts?.map ?? null,
    agent: facts?.agent ?? null,
    headline: notes?.headline?.text ?? null,
    subline: notes?.subline?.text ?? null,
    positive: notes?.positive?.text ?? null,
    notesCapped: !notes?.headline?.text && !!usage && usage.used >= usage.limit,
    facts: matchReportFactRows(facts),
    focusCheck: res.focus_check && focus ? { label: focus.label, hit: res.focus_check.hit } : null,
    nextSteps: nextSteps.slice(0, 3),
    isAlt: res.account?.is_main === false,
  }
}

/** Which games have a free match report today (CS2 needs its demo parsed; the page says so). */
export function matchReportSupported(game: string | null | undefined): boolean {
  return game === 'valorant' || game === 'lol' || game === 'deadlock' || game === 'cs2'
}

/** Report route for a match, or null when this match can't have one. CS2 reports are keyed by recording. */
export function matchReportPath(game: string | null | undefined, matchId: string | null | undefined, recordingId?: string | null): string | null {
  if (game === 'cs2') return recordingId && /^[A-Za-z0-9_-]{1,64}$/.test(recordingId) ? `/report/${recordingId}?game=cs2` : null
  if (typeof matchId !== 'string') return null
  if (game === 'valorant' && /^[A-Za-z0-9_-]{1,64}$/.test(matchId)) return `/report/${matchId}`
  if (game === 'lol' && /^[A-Z0-9]{2,8}_\d{1,20}$/i.test(matchId)) return `/report/${matchId}?game=lol`
  if (game === 'deadlock' && /^\d{1,20}$/.test(matchId)) return `/report/${matchId}?game=deadlock`
  return null
}
