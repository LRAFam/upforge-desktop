/**
 * Progress v3 "Your playstyle": rows built only from numbers the API already computed
 * (GET /api/progress/playstyle-profile, GET /api/skill-profile). Nothing is estimated here.
 */

export interface PlaystyleProfileLike {
  matches_tracked: number
  metrics: Record<string, unknown>
  agent_pool?: Record<string, number>
}

export interface PlaystyleRow {
  key: string
  label: string
  /** 0–100 for a bar; null for a plain number row. */
  pct: number | null
  value: string
  /** What the percentage is out of, e.g. "of your deaths". */
  of: string
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {})

const PCT_ROWS: Array<{ key: string; label: string; of: string; combat?: boolean }> = [
  { key: 'first_blood_got_rate_pct', label: 'Opening duels won', of: 'of opening duels you took part in', combat: true },
  { key: 'first_death_rate_pct', label: 'First to die', of: 'of rounds' },
  { key: 'untraded_death_rate_pct', label: 'Deaths with no trade', of: 'of your deaths', combat: true },
  { key: 'eco_sheriff_rate_pct', label: 'Sheriff on eco rounds', of: 'of eco rounds' },
]

export function playstyleRows(p: PlaystyleProfileLike | null | undefined): PlaystyleRow[] {
  if (!p) return []
  const m = rec(p.metrics)
  const combat = rec(m.combat)
  const rows: PlaystyleRow[] = []
  for (const r of PCT_ROWS) {
    const v = num((r.combat ? combat : m)[r.key])
    if (v == null) continue
    const pct = Math.min(100, Math.max(0, Math.round(v)))
    rows.push({ key: r.key, label: r.label, pct, value: `${pct}%`, of: r.of })
  }
  const kd = num(combat.kd_ratio)
  if (kd != null) rows.push({ key: 'kd_ratio', label: 'K/D', pct: null, value: kd.toFixed(2), of: '' })
  const util = num(m.util_casts_per_round)
  if (util != null) rows.push({ key: 'util_casts_per_round', label: 'Utility per round', pct: null, value: (Math.round(util * 10) / 10).toFixed(1), of: '' })
  return rows
}

/** "Duelist in 56 of 100 tracked matches" — whole-number counts, most-played role only. */
export function roleSentence(p: PlaystyleProfileLike | null | undefined): string | null {
  if (!p) return null
  const roles = Object.entries(rec(rec(p.metrics).roles_played))
    .map(([role, n]) => [role, num(n) ?? 0] as const)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
  const total = roles.reduce((s, [, n]) => s + n, 0)
  if (!roles.length || !total) return null
  const [role, n] = roles[0]!
  return `${role} in ${n} of ${total} tracked matches`
}

/** "Jett 45 · Fade 29 · Reyna 11" — top three agents by matches. */
export function agentPoolLine(p: PlaystyleProfileLike | null | undefined, max = 3): string | null {
  const pool = Object.entries(rec(p?.agent_pool ?? rec(p?.metrics).agents))
    .map(([a, n]) => [a, num(n) ?? 0] as const)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
  return pool.length ? pool.map(([a, n]) => `${a} ${n}`).join(' · ') : null
}

/** API category keys → plain labels ("decision_making" → "Decision making"). */
export function categoryLabel(key: string): string {
  const words = key.replace(/[_-]+/g, ' ').trim()
  return words ? words[0]!.toUpperCase() + words.slice(1).toLowerCase() : key
}
