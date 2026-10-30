/**
 * Pure maths for the v3 Progress screen. Rank history is plotted as ELO (a continuous
 * rating); RR resets to 0–100 at every tier change and must never be plotted.
 */

export interface RankSnapshot { id?: number; date: string; rank: string | null; rr: number; elo: number }
export interface EloPoint { t: number; elo: number; rank: string | null }

/** Valid ELO points, oldest first. Snapshots without a usable ELO or date are dropped, never mixed with RR. */
export function eloSeries(history: RankSnapshot[]): EloPoint[] {
  return history
    .map(h => ({ t: new Date(h.date).getTime(), elo: h.elo, rank: h.rank }))
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

export interface ChartBox { width: number; height: number; padX: number; padTop: number; padBottom: number }

export interface ChartGeometry {
  points: Array<{ x: number; y: number }>
  line: string
  area: string
  min: number
  max: number
  xAt: (t: number) => number
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
  const innerW = box.width - box.padX * 2
  const innerH = box.height - box.padTop - box.padBottom
  const xAt = (t: number) => box.padX + (t1 === t0 ? innerW / 2 : ((t - t0) / (t1 - t0)) * innerW)
  const yAt = (v: number) => box.padTop + ((max - v) / (max - min)) * innerH
  const points = series.map(p => ({ x: round(xAt(p.t)), y: round(yAt(p.elo)) }))
  const line = 'M' + points.map(p => `${p.x},${p.y}`).join(' L')
  const base = box.height - box.padBottom
  const area = `${line} L${points[points.length - 1].x},${base} L${points[0].x},${base} Z`
  return { points, line, area, min, max, xAt: t => round(xAt(t)) }
}

/** First-half vs second-half averages of a metric (oldest first). Null when fewer than 2 values. */
export function halfDelta(values: Array<number | null | undefined>): { first: number; last: number } | null {
  const v = values.filter((x): x is number => typeof x === 'number' && Number.isFinite(x))
  if (v.length < 2) return null
  const split = Math.max(1, Math.floor(v.length / 2))
  const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length
  return { first: avg(v.slice(0, split)), last: avg(v.slice(split)) }
}

/** SVG polyline points for a small sparkline. */
export function sparkline(values: number[], width: number, height: number): string {
  if (values.length < 2) return ''
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const span = hi - lo || 1
  return values.map((v, i) => `${round((i / (values.length - 1)) * width)},${round(height - 3 - ((v - lo) / span) * (height - 6))}`).join(' ')
}

/** "opening_death_rate" → "Opening death rate". */
export function metricLabel(key: string): string {
  const s = key.replace(/_/g, ' ').trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
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
