/**
 * Shared match-stat formulas for Home "Recent form" and Progress, so every screen counts the same way.
 *
 * - Win/loss: only matches with a known result count (a missing result is never a loss).
 * - K/D: total kills / total deaths over the matches that have both (like tracker.gg), not a mean of ratios.
 * - ACS: total combat score / total rounds when every match knows its rounds, else the mean of per-match ACS.
 * - "Last N": newest played first (`played_at`, else when it was analysed), not newest analysed first.
 */

/**
 * The API's `won` as true / false / null. `/api/analysis/recent` sends `matches.won` straight from SQL,
 * so Riot-linked rows arrive as 1 / 0 while desktop rows arrive as true / false.
 */
export function toMatchWon(v: unknown): boolean | null {
  if (v === true || v === 1 || v === '1' || v === 'true') return true
  if (v === false || v === 0 || v === '0' || v === 'false') return false
  return null
}

/** When the match was played (ms): `played_at`, else `created_at`; 0 when neither parses. */
export function playedTime(a: { played_at?: string | null; created_at?: string | null }): number {
  for (const iso of [a.played_at, a.created_at]) {
    const t = iso ? Date.parse(iso) : NaN
    if (Number.isFinite(t)) return t
  }
  return 0
}

/** Newest played first. Stable: rows with the same time keep the API's order. */
export function newestPlayedFirst<T extends { played_at?: string | null; created_at?: string | null }>(items: readonly T[]): T[] {
  return items
    .map((a, i) => ({ a, i, t: playedTime(a) }))
    .sort((x, y) => (y.t - x.t) || (x.i - y.i))
    .map(x => x.a)
}

const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)

/** Mean of the finite values, rounded; null when there are none. */
export function roundedMean(vals: ReadonlyArray<number | null | undefined>): number | null {
  const v = vals.filter(finite)
  return v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length) : null
}

/** Win rate 0–100 over matches with a known result; null when none has one. */
export function winRatePct(list: ReadonlyArray<{ won: boolean | null }>): number | null {
  const known = list.filter(a => a.won === true || a.won === false)
  if (!known.length) return null
  return Math.round((known.filter(a => a.won === true).length / known.length) * 100)
}

/** Total kills / total deaths over matches with both (deaths floored at 1); null when none. */
export function pooledKd(list: ReadonlyArray<{ kills: number | null; deaths: number | null }>): number | null {
  const withKd = list.filter(a => finite(a.kills) && finite(a.deaths))
  if (!withKd.length) return null
  const kills = withKd.reduce((s, a) => s + (a.kills as number), 0)
  const deaths = withKd.reduce((s, a) => s + (a.deaths as number), 0)
  return kills / Math.max(1, deaths)
}

/**
 * Average combat score per round over several matches. When every match knows its rounds, it is
 * total score / total rounds (a 24-round match weighs more than a 13-round one); otherwise the mean
 * of the per-match ACS values.
 */
export function averageAcs(rows: ReadonlyArray<{ acs: number | null; rounds: number | null }>): number | null {
  const withAcs = rows.filter(r => finite(r.acs))
  if (!withAcs.length) return null
  if (withAcs.every(r => finite(r.rounds) && (r.rounds as number) > 0)) {
    const rounds = withAcs.reduce((s, r) => s + (r.rounds as number), 0)
    return Math.round(withAcs.reduce((s, r) => s + (r.acs as number) * (r.rounds as number), 0) / rounds)
  }
  return roundedMean(withAcs.map(r => r.acs))
}
