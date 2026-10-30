/**
 * Rank pace (board P6 "rank forecast"): "At this pace, Gold 3 in about 3–5 weeks".
 * Only with at least 20 data points over at least 14 days and a clear upward trend;
 * otherwise nothing. A range, never a single promise.
 */
export interface PacePoint { t: number; value: number }

export const FORECAST_MIN_POINTS = 20
export const FORECAST_MIN_DAYS = 14
/** Ranges longer than this are too vague to show. */
export const FORECAST_MAX_WEEKS = 26
const DAY = 86_400_000

export interface RankForecast { target: string; minWeeks: number; maxWeeks: number; sentence: string }

/** Least-squares slope (value per day) and its standard error. */
export function paceSlope(points: PacePoint[]): { slope: number; se: number } | null {
  if (points.length < 3) return null
  const xs = points.map(p => p.t / DAY)
  const ys = points.map(p => p.value)
  const n = xs.length
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let sxx = 0
  let sxy = 0
  for (let i = 0; i < n; i++) { sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (ys[i] - my) }
  if (sxx === 0) return null
  const slope = sxy / sxx
  let sse = 0
  for (let i = 0; i < n; i++) sse += (ys[i] - (my + slope * (xs[i] - mx))) ** 2
  const se = Math.sqrt(sse / Math.max(1, n - 2) / sxx)
  return { slope, se }
}

/**
 * @param step  ladder units per division (100 for Valorant RR and League LP)
 * @param nameOf name of the division that starts at a ladder value (null when there is no next division)
 */
export function rankForecast(points: PacePoint[], step: number, nameOf: (divisionStart: number) => string | null): RankForecast | null {
  const sorted = points.filter(p => Number.isFinite(p.t) && Number.isFinite(p.value)).sort((a, b) => a.t - b.t)
  if (sorted.length < FORECAST_MIN_POINTS) return null
  if ((sorted[sorted.length - 1].t - sorted[0].t) / DAY < FORECAST_MIN_DAYS) return null
  const fit = paceSlope(sorted)
  if (!fit) return null
  const low = fit.slope - fit.se
  const high = fit.slope + fit.se
  if (low <= 0) return null // trend isn't clearly upward
  const current = sorted[sorted.length - 1].value
  const nextStart = (Math.floor(current / step) + 1) * step
  const target = nameOf(nextStart)
  if (!target) return null
  const remaining = nextStart - current
  const minWeeks = Math.max(1, Math.round(remaining / high / 7))
  const maxWeeks = Math.max(minWeeks, Math.round(remaining / low / 7))
  if (maxWeeks > FORECAST_MAX_WEEKS) return null
  const span = minWeeks === maxWeeks ? `about ${minWeeks} ${minWeeks === 1 ? 'week' : 'weeks'}` : `about ${minWeeks}–${maxWeeks} weeks`
  return { target, minWeeks, maxWeeks, sentence: `At this pace, ${target} in ${span}.` }
}

const VAL_TIERS = ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Ascendant', 'Immortal']
/** Valorant ladder value (elo) = (tier − 3) × 100 + RR, tiers 3–26 = Iron 1 … Immortal 3. */
export function valorantDivisionName(divisionStart: number): string | null {
  const idx = Math.floor(divisionStart / 100) // 0 = Iron 1
  if (idx < 0 || idx >= VAL_TIERS.length * 3) return null // Radiant is a leaderboard, not a pace target
  return `${VAL_TIERS[Math.floor(idx / 3)]} ${(idx % 3) + 1}`
}

const LOL_TIERS = ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Emerald', 'Diamond']
const LOL_DIVS = ['IV', 'III', 'II', 'I']
/** League ladder value = tier × 400 + division × 100 + LP (IV = 0); Master starts at 2800. */
export function leagueDivisionName(divisionStart: number): string | null {
  const idx = Math.floor(divisionStart / 100)
  if (idx === LOL_TIERS.length * 4) return 'Master'
  if (idx < 0 || idx > LOL_TIERS.length * 4) return null
  return `${LOL_TIERS[Math.floor(idx / 4)]} ${LOL_DIVS[idx % 4]}`
}
