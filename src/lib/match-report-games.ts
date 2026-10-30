/**
 * Free match reports for League, Deadlock and CS2. Facts come from code (API facts for
 * League/Deadlock, the desktop-parsed demo for CS2); the key number and next steps are
 * rule-based from this match only: whole numbers, no outside benchmarks, no AI.
 */
import type { FactRow, MatchReportView, NextStep } from './match-report'
import { buildCs2MatchView, type Cs2StatsV1 } from '../components/v3/matchpage/cs2/cs2-match-view'

export type ReportGame = 'valorant' | 'lol' | 'deadlock' | 'cs2'

const n = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`
const thousands = (v: number) => Math.round(v).toLocaleString('en-GB')
const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`
const duration = (sec: number) => (sec >= 60 ? `${Math.floor(sec / 60)}m ${String(Math.round(sec % 60)).padStart(2, '0')}s` : `${Math.round(sec)}s`)
export function ordinal(v: number): string {
  const s = v % 100 >= 11 && v % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[v % 10] ?? 'th'
  return `${v}${s}`
}

function baseView(game: ReportGame, matchId: string): MatchReportView {
  return {
    matchId, game, result: null, score: null, map: null, agent: null, headline: null, subline: null, positive: null,
    notesCapped: false, facts: [], focusCheck: null, nextSteps: [], isAlt: false, headlineLabel: 'The key number', metaLine: null,
  }
}

// ---------------------------------------------------------------- League

export interface LolReportFacts {
  champion?: string | null
  role?: string | null
  won?: boolean | null
  duration_sec?: number | null
  team_kills?: number | null
  enemy_kills?: number | null
  kda?: { kills?: number; deaths?: number; assists?: number } | null
  cs?: number | null
  cs_per_min?: number | null
  vision_score?: number | null
  damage_share?: number | null
  challenges?: { cs_at_10?: number | null; kill_participation?: number | null; solo_kills?: number | null; control_wards?: number | null; max_cs_lead?: number | null } | null
  lane?: { opponent_champion?: string | null; at?: Record<string, { cs?: number; opponent_cs?: number; gold_diff?: number; xp_diff?: number }>; first_death_sec?: number | null } | null
  early_deaths?: number | null
}
export interface LolReportResponse {
  match_id: string
  account?: { is_main: boolean } | null
  facts?: LolReportFacts | null
  focus?: { label: string; progress?: { status?: string } } | null
  focus_check?: { hit: boolean } | null
}

const ROLE: Record<string, string> = { TOP: 'Top', JUNGLE: 'Jungle', MIDDLE: 'Mid', BOTTOM: 'Bot', UTILITY: 'Support' }

export function lolReportView(res: LolReportResponse): MatchReportView {
  const v = baseView('lol', res.match_id)
  const f = res.facts ?? {}
  const c = f.challenges ?? {}
  const opp = f.lane?.opponent_champion ?? null
  const at10 = f.lane?.at?.['10']
  const at15 = f.lane?.at?.['15']
  v.result = f.won == null ? null : f.won ? 'win' : 'loss'
  v.score = n(f.team_kills) && n(f.enemy_kills) ? `${f.team_kills}–${f.enemy_kills}` : null
  v.agent = f.champion ?? null
  v.metaLine = [f.champion, f.role ? ROLE[f.role] ?? f.role : null, n(f.duration_sec) ? clock(f.duration_sec) : null].filter(Boolean).join(' · ') || null
  v.isAlt = res.account?.is_main === false

  const rows: FactRow[] = []
  const k = f.kda
  if (k && n(k.kills) && n(k.deaths) && n(k.assists)) rows.push({ label: 'K / D / A', value: `${k.kills} / ${k.deaths} / ${k.assists}` })
  if (n(f.cs)) rows.push({ label: 'CS', value: n(f.cs_per_min) ? `${f.cs} (${f.cs_per_min.toFixed(1)} a minute)` : String(f.cs) })
  if (at10 && n(at10.cs)) rows.push({ label: 'CS at 10:00', value: opp && n(at10.opponent_cs) ? `${at10.cs} vs ${opp} ${at10.opponent_cs}` : String(at10.cs) })
  if (at15 && n(at15.gold_diff) && opp) rows.push({ label: 'Gold vs your lane at 15:00', value: `${at15.gold_diff >= 0 ? '+' : '−'}${thousands(Math.abs(at15.gold_diff))}` })
  if (n(f.early_deaths)) rows.push({ label: 'Deaths before 14:00', value: String(f.early_deaths) })
  if (n(c.kill_participation)) rows.push({ label: 'Kill participation', value: `${Math.round(c.kill_participation * 100)}%` })
  if (n(f.damage_share)) rows.push({ label: 'Share of team damage', value: `${Math.round(f.damage_share * 100)}%` })
  if (n(f.vision_score)) rows.push({ label: 'Vision score', value: String(f.vision_score) })
  if (n(c.control_wards)) rows.push({ label: 'Control wards placed', value: String(c.control_wards) })
  v.facts = rows

  // Key number: the biggest measured swing in this match.
  if (at15 && n(at15.gold_diff) && opp && Math.abs(at15.gold_diff) >= 500) {
    v.headline = `You were ${thousands(Math.abs(at15.gold_diff))} gold ${at15.gold_diff < 0 ? 'behind' : 'ahead of'} ${opp} at 15:00.`
  } else if (n(f.early_deaths) && f.early_deaths >= 2) {
    v.headline = `You died ${plural(f.early_deaths, 'time')} before 14:00.`
  } else if (k && n(k.kills) && n(k.deaths) && n(k.assists)) {
    v.headline = `You finished ${k.kills} / ${k.deaths} / ${k.assists}${f.champion ? ` on ${f.champion}` : ''}.`
  }

  const steps: NextStep[] = []
  if (n(f.early_deaths) && f.early_deaths >= 2) steps.push({ text: `Aim for ${f.early_deaths - 1} or fewer deaths before 14:00 next game (this game: ${f.early_deaths}).`, drillMetric: null })
  if (at10 && n(at10.cs) && n(at10.opponent_cs) && opp && at10.cs < at10.opponent_cs) {
    steps.push({ text: `You were ${plural(at10.opponent_cs - at10.cs, 'CS', 'CS')} behind ${opp} at 10:00. Next game, put the first 10 minutes into last-hitting.`, drillMetric: null })
  }
  if (c.control_wards === 0) steps.push({ text: 'You placed no control wards. Buy one on your next back.', drillMetric: null })
  if (res.focus && res.focus.progress?.status === 'active' && steps.length < 3) steps.push({ text: `Keep working on your focus: ${res.focus.label}.`, drillMetric: null })
  v.nextSteps = steps.slice(0, 3)

  if (n(c.solo_kills) && c.solo_kills >= 1) v.positive = `You won ${plural(c.solo_kills, 'solo kill')}.`
  else if (n(c.max_cs_lead) && c.max_cs_lead >= 10 && opp) v.positive = `You led ${opp} by up to ${c.max_cs_lead} CS.`
  if (res.focus && res.focus_check) v.focusCheck = { label: res.focus.label, hit: res.focus_check.hit }
  return v
}

// ---------------------------------------------------------------- Deadlock

export interface DeadlockReportFacts {
  hero?: string | null
  won?: boolean | null
  duration_sec?: number | null
  kda?: { kills?: number; deaths?: number; assists?: number } | null
  souls?: number | null
  souls_rank?: number | null
  lobby_size?: number | null
  souls_at?: Record<string, { souls?: number; lobby_avg?: number | null; lane_opponents_avg?: number | null }>
  orbs_secured?: number | null
  orbs_denied?: number | null
  player_damage?: number | null
  damage_rank?: number | null
  early_deaths?: number | null
  time_dead_sec?: number | null
}
export interface DeadlockReportResponse { match_id: string; facts?: DeadlockReportFacts | null }

export function deadlockReportView(res: DeadlockReportResponse): MatchReportView {
  const v = baseView('deadlock', res.match_id)
  const f = res.facts ?? {}
  const size = n(f.lobby_size) ? f.lobby_size : null
  const at10 = f.souls_at?.['10']
  const at20 = f.souls_at?.['20']
  v.result = f.won == null ? null : f.won ? 'win' : 'loss'
  v.agent = f.hero ?? null
  v.metaLine = [f.hero, n(f.duration_sec) ? clock(f.duration_sec) : null].filter(Boolean).join(' · ') || null

  const rows: FactRow[] = []
  const k = f.kda
  if (k && n(k.kills) && n(k.deaths) && n(k.assists)) rows.push({ label: 'K / D / A', value: `${k.kills} / ${k.deaths} / ${k.assists}` })
  if (n(f.souls)) rows.push({ label: 'Souls', value: n(f.souls_rank) && size ? `${thousands(f.souls)} (${ordinal(f.souls_rank)} of ${size})` : thousands(f.souls) })
  for (const [min, s] of [['10', at10], ['20', at20]] as const) {
    if (s && n(s.souls)) rows.push({ label: `Souls at ${min}:00`, value: n(s.lobby_avg) ? `${thousands(s.souls)} vs lobby average ${thousands(s.lobby_avg)}` : thousands(s.souls) })
  }
  if (at10 && n(at10.lane_opponents_avg)) rows.push({ label: 'Lane opponents at 10:00', value: `${thousands(at10.lane_opponents_avg)} on average` })
  if (n(f.orbs_secured)) rows.push({ label: 'Soul orbs secured', value: n(f.orbs_denied) ? `${f.orbs_secured} · ${f.orbs_denied} denied` : String(f.orbs_secured) })
  if (n(f.player_damage)) rows.push({ label: 'Hero damage', value: n(f.damage_rank) && size ? `${thousands(f.player_damage)} (${ordinal(f.damage_rank)} of ${size})` : thousands(f.player_damage) })
  if (n(f.early_deaths)) rows.push({ label: 'Deaths before 10:00', value: String(f.early_deaths) })
  if (n(f.time_dead_sec) && f.time_dead_sec > 0) rows.push({ label: 'Time spent dead', value: duration(f.time_dead_sec) })
  v.facts = rows

  const laneGap = at10 && n(at10.souls) && n(at10.lane_opponents_avg) ? at10.souls - at10.lane_opponents_avg : null
  if (laneGap != null && Math.abs(laneGap) >= 1000) {
    v.headline = `At 10:00 you had ${thousands(Math.abs(laneGap))} ${laneGap < 0 ? 'fewer' : 'more'} souls than your lane opponents' average.`
  } else if (n(f.early_deaths) && f.early_deaths >= 2) {
    v.headline = `You died ${plural(f.early_deaths, 'time')} before 10:00.`
  } else if (n(f.souls_rank) && size) {
    v.headline = `You finished ${ordinal(f.souls_rank)} of ${size} in souls.`
  }

  const steps: NextStep[] = []
  if (n(f.early_deaths) && f.early_deaths >= 2) steps.push({ text: `Aim for ${f.early_deaths - 1} or fewer deaths before 10:00 next game (this game: ${f.early_deaths}).`, drillMetric: null })
  if (laneGap != null && laneGap <= -1000) steps.push({ text: 'Stay near your lane’s troopers and secure their soul orbs before trading.', drillMetric: null })
  if (n(f.time_dead_sec) && n(f.duration_sec) && f.duration_sec > 0 && f.time_dead_sec / f.duration_sec >= 0.1) {
    steps.push({ text: `You spent ${duration(f.time_dead_sec)} dead. Pick fights you can leave before committing.`, drillMetric: null })
  }
  v.nextSteps = steps.slice(0, 3)
  if (f.souls_rank === 1 && size) v.positive = `Most souls in the lobby (${ordinal(1)} of ${size}).`
  else if (f.damage_rank === 1 && size) v.positive = `Most hero damage in the lobby (${ordinal(1)} of ${size}).`
  return v
}

// ---------------------------------------------------------------- CS2

export interface Cs2ReportTimeline {
  id: string
  map?: string | null
  match_stats?: Cs2StatsV1 | null
  finalStats?: { won?: boolean | null } | null
}

/** null when the demo hasn't been parsed yet (the page shows "needs the demo"). */
export function cs2ReportView(t: Cs2ReportTimeline): MatchReportView | null {
  const stats = t.match_stats ?? null
  const built = buildCs2MatchView(stats)
  if (!stats || !built) return null
  const v = baseView('cs2', t.id)
  const ps = stats.player_stats ?? {}
  const p = (key: string) => (n(ps[key]) ? (ps[key] as number) : null)
  v.score = built.score
  v.map = t.map ?? null
  v.result = t.finalStats?.won == null ? null : t.finalStats.won ? 'win' : 'loss'
  v.metaLine = [t.map, built.rounds ? plural(built.rounds, 'round') : null].filter(Boolean).join(' · ') || null
  v.facts = [...built.headline, ...built.duels].filter(r => r.value !== 'Not measured').map(r => ({ label: r.label, value: r.value }))

  const ok = p('opening_kills')
  const od = p('opening_deaths')
  const zero = n(stats.round_stats?.zero_impact_rounds) ? (stats.round_stats!.zero_impact_rounds as number) : null
  const teamFlashed = n(stats.utility_stats?.teammates_flashed) ? (stats.utility_stats!.teammates_flashed as number) : null
  if (ok != null && od != null && od >= ok + 2) v.headline = `You lost ${od} of ${ok + od} opening duels.`
  else if (zero != null && zero >= 4) v.headline = `${plural(zero, 'round')} with no kill, assist or damage.`
  else if (p('kills') != null && p('deaths') != null) v.headline = `You finished ${p('kills')} / ${p('deaths')} / ${p('assists') ?? 0}.`

  const steps: NextStep[] = []
  if (ok != null && od != null && od >= ok + 2) steps.push({ text: `You lost ${od} of ${ok + od} opening duels. Next game, take the first fight with a teammate ready to trade.`, drillMetric: null })
  if (zero != null && zero >= 4) steps.push({ text: `${plural(zero, 'round')} had no kill, assist or damage. Use your utility in those rounds even when you don't take a fight.`, drillMetric: null })
  if (teamFlashed != null && teamFlashed >= 3) steps.push({ text: `You flashed teammates ${plural(teamFlashed, 'time')}. Call your flashes before you throw them.`, drillMetric: null })
  v.nextSteps = steps.slice(0, 3)
  const cw = p('clutches_won')
  if (cw != null && cw >= 1) v.positive = `You won ${plural(cw, 'clutch', 'clutches')}.`
  return v
}
