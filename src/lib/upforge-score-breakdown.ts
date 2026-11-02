/**
 * "Why 612?" — how the stats-based UpForge score was made (API `upforge_score_breakdown`,
 * see upforge-api/docs/UPFORGE_SCORE.md §7). Pure helpers: they only word what the API returned.
 */

export interface UpforgeScoreBaseline {
  /** tier = players at that rank · all = every rank pooled · prior = fixed early estimate. */
  source: 'tier' | 'all' | 'prior' | string
  tier: string | null
  samples: number | null
}

export interface UpforgeScoreInput {
  key: string
  label: string
  value: number | string | null
  /** 0–100 against the baseline. */
  percentile: number
  /** 0–1 share of the score. */
  weight: number
}

export interface UpforgeScoreBreakdown {
  version?: number
  score?: number
  game?: string
  tier?: string | null
  baseline: UpforgeScoreBaseline
  inputs: UpforgeScoreInput[]
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const rec = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null)

/** Stats score 0–1000, or null when missing/invalid. */
export function sanitizeUpforgeScore(v: unknown): number | null {
  return isNum(v) ? Math.round(Math.min(1000, Math.max(0, v))) : null
}

/** Keeps only well-formed parts of the API breakdown; null when nothing usable is left. */
export function sanitizeUpforgeScoreBreakdown(raw: unknown): UpforgeScoreBreakdown | null {
  const r = rec(raw)
  const b = rec(r?.baseline)
  if (!r || !b || !Array.isArray(r.inputs)) return null
  const inputs: UpforgeScoreInput[] = []
  for (const item of r.inputs) {
    const i = rec(item)
    if (!i || typeof i.key !== 'string' || typeof i.label !== 'string' || !isNum(i.percentile) || !isNum(i.weight)) continue
    inputs.push({
      key: i.key,
      label: i.label,
      value: isNum(i.value) || typeof i.value === 'string' ? i.value : null,
      percentile: Math.min(100, Math.max(0, i.percentile)),
      weight: Math.min(1, Math.max(0, i.weight)),
    })
  }
  if (!inputs.length) return null
  return {
    ...(isNum(r.version) ? { version: r.version } : {}),
    ...(isNum(r.score) ? { score: r.score } : {}),
    ...(typeof r.game === 'string' ? { game: r.game } : {}),
    tier: typeof r.tier === 'string' ? r.tier : null,
    baseline: {
      source: typeof b.source === 'string' ? b.source : 'prior',
      tier: typeof b.tier === 'string' ? b.tier : null,
      samples: isNum(b.samples) ? Math.round(b.samples) : null,
    },
    inputs,
  }
}

/** "platinum" → "Platinum". */
export function tierName(tier: string | null | undefined): string | null {
  if (!tier || tier === 'all' || tier === 'unranked') return null
  return tier.charAt(0).toUpperCase() + tier.slice(1).toLowerCase()
}

/** 1 → "1st", 72 → "72nd", 13 → "13th". */
export function ordinal(n: number): string {
  const v = Math.round(n)
  const t = v % 100
  if (t >= 11 && t <= 13) return `${v}th`
  return `${v}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[v % 10] ?? 'th'}`
}

/** Who the match was compared with, in a plain sentence. */
export function baselineLine(b: UpforgeScoreBaseline): string {
  const tier = tierName(b.tier)
  const n = b.samples != null && b.samples > 0 ? b.samples.toLocaleString('en-GB') : null
  if (b.source === 'tier' && tier) return n ? `Compared with ${n} ${tier} players` : `Compared with ${tier} players`
  if (b.source === 'all') return n ? `Compared with ${n} players of all ranks` : 'Compared with players of all ranks'
  return 'Early estimate: not enough players at your rank yet, so this uses typical averages'
}

export interface BreakdownRow {
  key: string
  /** "ACS · 72nd percentile for Platinum" */
  text: string
  /** Bar fill 0–100 (the percentile). */
  percentile: number
  /** "30% of the score" */
  share: string
}

/** One plain row per input, in the API's order. */
export function breakdownRows(bd: UpforgeScoreBreakdown): BreakdownRow[] {
  const tier = bd.baseline.source === 'tier' ? tierName(bd.baseline.tier) : null
  const who = tier ? ` for ${tier}` : bd.baseline.source === 'all' ? ' across all ranks' : ''
  return bd.inputs.map(i => ({
    key: i.key,
    text: `${i.label} · ${ordinal(i.percentile)} percentile${who}`,
    percentile: Math.round(i.percentile),
    share: `${Math.round(i.weight * 100)}% of the score`,
  }))
}
