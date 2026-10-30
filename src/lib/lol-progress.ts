/**
 * League Progress (UI v3): rank line from stored League-V4 snapshots and trends from recent
 * Match-V5 summaries. Real data only — a metric with too few games returns nothing.
 */
import type { LolMatchSummary } from '../env.d.ts'

/** Recent-match summary with the trend fields the API adds (older APIs omit them). */
export type LolTrendMatch = LolMatchSummary & {
  cs_per_min?: number | null
  vision_per_min?: number | null
  damage_share?: number | null
  /** Riot's Match-V5 `challenges` subset (API adds it; null when Riot sent none). */
  challenges?: { cs_at_10?: number | null; kill_participation?: number | null } | null
}

export interface LolRankSnapshot {
  captured_at: string
  tier: string
  division: string | null
  league_points: number
  label: string
  value: number
}

export interface LolRankPayload {
  rank: LolRankSnapshot | null
  rank_history: LolRankSnapshot[]
}

export interface LolTrend {
  key: 'cs_per_min' | 'cs_at_10' | 'vision_per_min' | 'damage_share' | 'kill_participation' | 'deaths'
  label: string
  /** Oldest → newest. */
  values: number[]
  earlier: number
  recent: number
  /** 'better' / 'worse' accounts for metrics where lower is better (deaths). */
  direction: 'better' | 'worse' | 'flat'
  format: (v: number) => string
}

const MIN_GAMES = 6

const METRICS: Array<Omit<LolTrend, 'values' | 'earlier' | 'recent' | 'direction'> & { pick: (m: LolTrendMatch) => number | null | undefined; lowerIsBetter?: boolean; flat: number }> = [
  { key: 'cs_per_min', label: 'CS per minute', pick: m => m.cs_per_min, format: v => v.toFixed(1), flat: 0.2 },
  { key: 'cs_at_10', label: 'CS at 10:00', pick: m => m.challenges?.cs_at_10, format: v => String(Math.round(v)), flat: 3 },
  { key: 'vision_per_min', label: 'Vision per minute', pick: m => m.vision_per_min, format: v => v.toFixed(2), flat: 0.05 },
  { key: 'damage_share', label: 'Share of team damage', pick: m => m.damage_share, format: v => `${Math.round(v * 100)}%`, flat: 0.015 },
  { key: 'kill_participation', label: 'Kill participation', pick: m => m.challenges?.kill_participation, format: v => `${Math.round(v * 100)}%`, flat: 0.03 },
  { key: 'deaths', label: 'Deaths per game', pick: m => m.deaths, format: v => v.toFixed(1), lowerIsBetter: true, flat: 0.3 },
]

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

/** Trends over the last games (input newest first, as the API returns them). */
export function lolTrends(matches: LolTrendMatch[], limit = 20): LolTrend[] {
  const games = [...matches].slice(0, limit).reverse()
  const out: LolTrend[] = []
  for (const m of METRICS) {
    const values = games.map(m.pick).filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    if (values.length < MIN_GAMES) continue
    const half = Math.floor(values.length / 2)
    const earlier = avg(values.slice(0, half))
    const recent = avg(values.slice(half))
    const delta = recent - earlier
    const improved = m.lowerIsBetter ? delta < 0 : delta > 0
    out.push({
      key: m.key, label: m.label, values, earlier, recent, format: m.format,
      direction: Math.abs(delta) < m.flat ? 'flat' : improved ? 'better' : 'worse',
    })
  }
  return out
}

export function lolTrendSentence(t: LolTrend): string {
  const n = t.values.length
  if (t.direction === 'flat') return `${t.label} has held at about ${t.format(t.recent)} over your last ${n} games.`
  return `${t.label}: ${t.format(t.earlier)} → ${t.format(t.recent)} across your last ${n} games (earlier half vs recent half).`
}

/** Rank line points, oldest first; needs two snapshots to draw. */
export function lolRankSeries(payload: LolRankPayload | null | undefined): LolRankSnapshot[] {
  const history = payload?.rank_history ?? []
  return history.filter(h => typeof h.value === 'number' && Number.isFinite(h.value) && typeof h.label === 'string')
}

export function lolRankSentence(series: LolRankSnapshot[]): string {
  if (series.length < 2) return ''
  const first = series[0]
  const last = series[series.length - 1]
  if (last.value === first.value) return `Your rank has held at ${last.label} since UpForge started tracking it.`
  const dir = last.value > first.value ? 'up' : 'down'
  return `Your rank is ${dir} from ${first.label} to ${last.label} since UpForge started tracking it.`
}

/** League analysis row with the early-death fields the API adds (older APIs omit them). */
export interface LolEarlyDeathRow {
  /** Played on a League alt: never counted in the main account's Progress. */
  is_alt?: boolean
  early_deaths?: number | null
  first_death_sec?: number | null
}

export interface LolEarlyDeaths {
  games: number
  average: number
  firstDeathSec: number | null
  sentence: string
}

const MIN_EARLY_GAMES = 3
const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** Deaths before 14:00 across coached games, from the stored Riot timeline (no extra Riot calls). */
export function lolEarlyDeaths(rows: LolEarlyDeathRow[]): LolEarlyDeaths | null {
  const games = rows.filter(r => r.is_alt !== true && typeof r.early_deaths === 'number' && Number.isFinite(r.early_deaths))
  if (games.length < MIN_EARLY_GAMES) return null
  const average = Math.round(avg(games.map(r => r.early_deaths as number)) * 10) / 10
  const firsts = games.map(r => r.first_death_sec).filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  const firstDeathSec = firsts.length ? median(firsts) : null
  // Whole numbers only: "died early in 3 of 4 games, 6 deaths in total" reads true; "1.5 deaths" doesn't.
  const gamesWithEarlyDeath = games.filter(r => (r.early_deaths as number) > 0).length
  const total = games.reduce((n, r) => n + (r.early_deaths as number), 0)
  const sentence = total === 0
    ? `In your last ${games.length} coached games you never died before 14:00.`
    : `You died before 14:00 in ${gamesWithEarlyDeath} of your last ${games.length} coached games, ${total} ${total === 1 ? 'death' : 'deaths'} in total.${firstDeathSec != null ? ` Your first death usually came at ${clock(firstDeathSec)}.` : ''}`
  return { games: games.length, average, firstDeathSec, sentence }
}
