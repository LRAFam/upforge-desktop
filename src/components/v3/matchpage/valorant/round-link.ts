/** Round links between screens use the number shown on screen (R1 = round 1); Riot rounds are 0-based. */
const MAX_ROUND = 60

/** `?round=4` → 3 (0-based). Anything that isn't a whole number in range → null. */
export function roundFromQuery(q: unknown): number | null {
  const raw = Array.isArray(q) ? q[0] : q
  if (typeof raw !== 'string' || !/^\d{1,2}$/.test(raw)) return null
  const n = Number(raw)
  return n >= 1 && n <= MAX_ROUND ? n - 1 : null
}

/** 0-based round → the query value (1-based). */
export function roundToQuery(round: number): string | null {
  return Number.isInteger(round) && round >= 0 && round < MAX_ROUND ? String(round + 1) : null
}
