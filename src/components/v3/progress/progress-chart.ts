/**
 * Pure maths for the v3 Progress screen. Rank history is plotted as ELO (a continuous
 * rating); RR resets to 0–100 at every tier change and must never be plotted.
 */

export interface RankSnapshot { id?: number; date: string; rank: string | null; rr: number; elo: number }
export interface EloPoint { t: number; elo: number; rank: string | null; rr?: number | null }

/** Valid ELO points, oldest first. Snapshots without a usable ELO or date are dropped, never mixed with RR. */
export function eloSeries(history: RankSnapshot[]): EloPoint[] {
  return history
    .map(h => ({ t: new Date(h.date).getTime(), elo: h.elo, rank: h.rank, rr: Number.isFinite(h.rr) ? h.rr : null }))
    .filter(p => Number.isFinite(p.t) && Number.isFinite(p.elo) && p.elo > 0)
    .sort((a, b) => a.t - b.t)
}

export function eloDelta(series: EloPoint[]): number | null {
  return series.length >= 2 ? series[series.length - 1].elo - series[0].elo : null
}

/** Indexes where the rank name changes (rank-up or rank-down markers). */
export function rankChanges(series: EloPoint[]): Array<{ index: number; from: string | null; to: string | null; up: boolean }> {
  const out: Array<{ index: number; from: string | null; to: string | null; up: boolean }> = []
  for (let i = 1; i < series.length; i++) {
    const a = series[i - 1]
    const b = series[i]
    if (a.rank && b.rank && a.rank !== b.rank) out.push({ index: i, from: a.rank, to: b.rank, up: b.elo > a.elo })
  }
  return out
}

/**
 * Keep rank badges readable on long ranges: drop a badge that would sit within `minGap` px of the
 * previously kept one (the newest change in a cluster wins, so the current rank is always shown).
 */
export function spacedByX<T extends { x: number }>(items: T[], minGap = 40): T[] {
  const out: T[] = []
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]
    if (!out.length || out[out.length - 1].x - it.x >= minGap) out.push(it)
  }
  return out.reverse()
}

/** `padLeft` (optional) leaves room for the value axis; it defaults to `padX`. */
export interface ChartBox { width: number; height: number; padX: number; padTop: number; padBottom: number; padLeft?: number }

export interface ChartGeometry {
  points: Array<{ x: number; y: number }>
  line: string
  area: string
  min: number
  max: number
  xAt: (t: number) => number
  yAt: (v: number) => number
}

/** Scales a series into an SVG box. X is by time (uneven gaps stay honest); Y has 10% headroom. */
export function chartGeometry(series: EloPoint[], box: ChartBox): ChartGeometry | null {
  if (series.length < 2) return null
  const t0 = series[0].t
  const t1 = series[series.length - 1].t
  const lo = Math.min(...series.map(p => p.elo))
  const hi = Math.max(...series.map(p => p.elo))
  const head = Math.max(10, (hi - lo) * 0.1)
  const min = lo - head
  const max = hi + head
  const left = box.padLeft ?? box.padX
  const innerW = box.width - left - box.padX
  const innerH = box.height - box.padTop - box.padBottom
  const xAt = (t: number) => left + (t1 === t0 ? innerW / 2 : ((t - t0) / (t1 - t0)) * innerW)
  const yAt = (v: number) => box.padTop + ((max - v) / (max - min)) * innerH
  const points = series.map(p => ({ x: round(xAt(p.t)), y: round(yAt(p.elo)) }))
  const line = 'M' + points.map(p => `${p.x},${p.y}`).join(' L')
  const base = box.height - box.padBottom
  const area = `${line} L${points[points.length - 1].x},${base} L${points[0].x},${base} Z`
  return { points, line, area, min, max, xAt: t => round(xAt(t)), yAt: v => round(yAt(v)) }
}

/** Where each rank division starts on the rating scale, read from the data (rating − RR), so no ladder is assumed. */
function divisionStarts(series: EloPoint[]): Map<number, string> {
  const out = new Map<number, string>()
  for (const p of series) {
    if (!p.rank || p.rr == null || p.rr < 0 || p.rr >= 100) continue
    const start = p.elo - p.rr
    if (!out.has(start)) out.set(start, p.rank)
  }
  return out
}

/**
 * Value-axis ticks for the rank chart. Rank boundaries (every 100 rating) inside the plotted range,
 * labelled with the rank that starts there when the data shows it; thinned to `maxTicks`. A window
 * inside one division gets RR steps instead ("Gold 1 · 50 RR").
 */
export function rankAxisTicks(series: EloPoint[], min: number, max: number, maxTicks = 5): Array<{ value: number; label: string }> {
  if (!series.length || !(max > min)) return []
  const starts = divisionStarts(series)
  const nameAt = (v: number) => starts.get(v) ?? null
  const bounds: number[] = []
  for (let v = Math.ceil(min / 100) * 100; v <= max; v += 100) bounds.push(v)
  if (bounds.length >= 2) {
    const step = Math.ceil(bounds.length / maxTicks)
    return bounds.filter((_, i) => i % step === 0).map(v => ({ value: v, label: nameAt(v) ?? String(v) }))
  }
  const out: Array<{ value: number; label: string }> = []
  for (let v = Math.ceil(min / 25) * 25; v <= max; v += 25) {
    const start = Math.floor(v / 100) * 100
    const rank = nameAt(start)
    const rr = v - start
    out.push({ value: v, label: rr === 0 ? (rank ?? String(v)) : rank ? `${rank} · ${rr} RR` : String(v) })
  }
  return out
}

const dayMonth = (t: number) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

export interface RankPointRow { date: string; rank: string; rr: string; change: string; label: string }

/**
 * One readable row per plotted point: date, absolute rank + RR, and the rating change since the
 * previous point (kept apart so a keyboard user never mixes rank with RR change).
 */
export function rankPointRows(series: EloPoint[]): RankPointRow[] {
  return series.map((p, i) => {
    const prev = i > 0 ? series[i - 1] : null
    const d = prev ? Math.round(p.elo - prev.elo) : null
    const change = d == null ? 'First point' : d === 0 ? 'No change' : `${d > 0 ? '+' : '−'}${Math.abs(d)} rating`
    const date = dayMonth(p.t)
    const rank = p.rank ?? 'Unranked'
    const rr = p.rr != null ? `${p.rr} RR` : '—'
    return { date, rank, rr, change, label: [date, rank, p.rr != null ? rr : null, d == null ? null : `${change} since the last point`].filter(Boolean).join(' · ') }
  })
}

/** Fewest values on each side of a first-half vs second-half comparison. Fewer is not a trend. */
export const MIN_TREND_SIDE = 3

/**
 * First-half vs second-half averages of a metric (oldest first). Null with fewer than
 * MIN_TREND_SIDE values per half, so no trend or "Up/Down" is shown from one or two matches.
 */
export function halfDelta(values: Array<number | null | undefined>): { first: number; last: number } | null {
  const v = values.filter((x): x is number => typeof x === 'number' && Number.isFinite(x))
  if (v.length < MIN_TREND_SIDE * 2) return null
  const split = Math.max(1, Math.floor(v.length / 2))
  const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length
  return { first: avg(v.slice(0, split)), last: avg(v.slice(split)) }
}

/** "Up 4%" / "Down 2" / "Steady"; "Early read" when there is no trend yet (halfDelta was null). */
export function trendDeltaLabel(v: number | null, suffix = ''): string {
  if (v == null) return 'Early read'
  if (Math.abs(v) < 0.05) return 'Steady'
  return `${v > 0 ? 'Up' : 'Down'} ${Math.abs(Math.abs(v) >= 10 ? Math.round(v) : Number(v.toFixed(1)))}${suffix}`
}

/** SVG polyline points for a small sparkline. */
export function sparkline(values: number[], width: number, height: number): string {
  if (values.length < 2) return ''
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const span = hi - lo || 1
  return values.map((v, i) => `${round((i / (values.length - 1)) * width)},${round(height - 3 - ((v - lo) / span) * (height - 6))}`).join(' ')
}

/**
 * Which way is better for each per-match habit metric, with its plain label. Mirrors
 * FOCUS_METRICS in upforge-ai-service/services/match_report_facts.py (the source of the values).
 * Note: traded_death_rate is the share of YOUR deaths a teammate traded, so higher is better.
 */
export const HABIT_METRICS: Record<string, { label: string; better: 'lower' | 'higher' }> = {
  opening_death_rate: { label: 'Opening deaths', better: 'lower' },
  early_opening_death_rate: { label: 'Opening deaths in the first 10s', better: 'lower' },
  traded_death_rate: { label: 'Deaths traded', better: 'higher' },
  zero_damage_round_rate: { label: 'Zero-damage rounds', better: 'lower' },
  headshot_hit_rate: { label: 'Hits on the head', better: 'higher' },
  leg_hit_rate: { label: 'Hits on the legs', better: 'lower' },
}

export type TrendTone = 'better' | 'worse' | 'flat' | null

/**
 * Better / worse / flat for a first→last change. `better` from the focus wins when given; otherwise the
 * metric map; unknown direction gives null (no colour). Changes that round to the same shown value are flat.
 */
export function habitTone(key: string, first: number, last: number, better?: 'lower' | 'higher' | null): TrendTone {
  const dir = better ?? HABIT_METRICS[key]?.better ?? null
  if (formatMetric(key, first) === formatMetric(key, last)) return 'flat'
  if (!dir) return null
  return (dir === 'lower' ? last < first : last > first) ? 'better' : 'worse'
}

/** Plain label: the known metric label, else "opening_death_rate" → "Opening death rate". */
export function metricLabel(key: string): string {
  if (HABIT_METRICS[key]) return HABIT_METRICS[key].label
  const s = key.replace(/_/g, ' ').trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Which points get a rank badge: the start, the first time each rank is reached in the window, and the
 * end. A rank that flips back and forth (Plat 1 ↔ Plat 2) gets one badge, not one per flip; every change
 * still keeps its up/down ring.
 */
export function badgeIndexes(series: EloPoint[]): number[] {
  if (!series.length) return []
  const seen = new Set<string>()
  const out: number[] = []
  series.forEach((p, i) => {
    if (!p.rank || seen.has(p.rank)) return
    seen.add(p.rank)
    out.push(i)
  })
  const end = series.length - 1
  if (series[end].rank && !out.includes(end) && series[end].rank !== series[out[out.length - 1]]?.rank) out.push(end)
  return out
}

/** Rates (0–1) as percentages; other values as-is. */
export function formatMetric(key: string, value: number): string {
  if (/rate|pct|share/.test(key) && value <= 1) return `${Math.round(value * 100)}%`
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function round(n: number): number {
  return Math.round(n * 10) / 10
}

const RANGE_DAYS: Record<string, number | null> = { '7d': 7, '30d': 30, '90d': 90, all: null }

/** Items whose date falls inside the picked range (All keeps everything; undated items only in All). */
export function inRange<T>(items: readonly T[], dateOf: (item: T) => string | null | undefined, range: string, now = Date.now()): T[] {
  const days = RANGE_DAYS[range]
  if (days == null) return [...items]
  const cutoff = now - days * 86_400_000
  return items.filter(item => {
    const t = new Date(dateOf(item) ?? '').getTime()
    return Number.isFinite(t) && t >= cutoff
  })
}

/**
 * Rank snapshots for the picked range, so the chart matches the range tabs. `null` when the range
 * can't make a line (the caller falls back to the whole history and says so).
 */
export function rankHistoryInRange(history: RankSnapshot[], range: string, now = Date.now()): RankSnapshot[] | null {
  const days = RANGE_DAYS[range]
  if (days == null) return history
  const cutoff = now - days * 86_400_000
  const dated = history.map(h => ({ h, t: new Date(h.date).getTime() })).filter(x => Number.isFinite(x.t)).sort((a, b) => a.t - b.t)
  const inside = dated.filter(x => x.t >= cutoff)
  const before = dated.filter(x => x.t < cutoff).pop()
  // Prefer points inside the range; borrow the last earlier point only when the range holds a single one.
  const picked = inside.length >= 2 ? inside : before && inside.length === 1 ? [before, ...inside] : []
  return picked.length >= 2 ? picked.map(x => x.h) : null
}
