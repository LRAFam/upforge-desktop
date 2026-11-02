/**
 * UpForge score — one number per match, out of 1000, shown the same way everywhere
 * (like tracker.gg's Tracker Score). No letter grades.
 *
 * The score itself is calculated by the API from match stats (`upforge_score`, see `matchScore` below).
 * The AI's rating (`overall_score`, stored 0–100) is the coach's opinion: shown as "Coach rating 7/10",
 * never under the UpForge name. (The old ×10 helpers upforgeScore/formatScore/averageScore were removed
 * in the 2026-11-02 audit.)
 */

export type ScoreTone = 'top' | 'good' | 'mid' | 'low'

/** Tiers follow the API's mapping (500 = average for your rank, 650 ≈ top 16%, 850 ≈ top 1%). */
export function scoreTier(value1000: number): { label: string, tone: ScoreTone } {
  if (value1000 >= 850) return { label: 'Outstanding', tone: 'top' }
  if (value1000 >= 650) return { label: 'Strong', tone: 'good' }
  if (value1000 >= 350) return { label: 'Average', tone: 'mid' }
  return { label: 'Below average', tone: 'low' }
}

/** CSS colour variable for a tone (v3 tokens). */
export function scoreToneColor(tone: ScoreTone): string {
  if (tone === 'top') return 'var(--uf-gold)'
  if (tone === 'good') return 'var(--uf-win)'
  if (tone === 'low') return 'var(--uf-loss)'
  return 'var(--uf-bone)'
}

/* ---- Stats-based UpForge score (API `upforge_score`, audit 2026-11-02) ----
 * The API now calculates the UpForge score from match stats against players at your rank
 * (docs/UPFORGE_SCORE.md in upforge-api): an int 0–1000, 500 = average for your rank.
 * It is already out of 1000 — never multiply it. The AI's own rating (overall_score) is the
 * coach's opinion and is shown as "Coach rating 7/10", never under the UpForge name.
 */

export interface MatchScoreInput {
  /** Stats-based score 0–1000 from the API, or null/undefined when not calculated. */
  upforge_score?: number | null
  /** The AI coach's rating stored 0–100 (1–10 ×10). */
  overall_score?: number | null
}

export type MatchScoreDisplay =
  | { kind: 'stats'; value: number; text: string; caption: 'UpForge score'; label: string; tone: ScoreTone }
  | { kind: 'coach'; value: number; text: string; caption: 'Coach rating'; label: null; tone: null }

/** The score to show for one match: the stats-based UpForge score, else the coach rating out of 10. */
export function matchScore(a: MatchScoreInput | null | undefined): MatchScoreDisplay | null {
  if (!a) return null
  const s = a.upforge_score
  if (s != null && Number.isFinite(s)) {
    const value = Math.round(Math.min(1000, Math.max(0, s)))
    return { kind: 'stats', value, text: String(value), caption: 'UpForge score', ...scoreTier(value) }
  }
  const c = a.overall_score
  if (c != null && Number.isFinite(c)) {
    const outOf10 = Math.round(Math.min(100, Math.max(0, c))) / 10
    const text = `${Number.isInteger(outOf10) ? outOf10 : outOf10.toFixed(1)}/10`
    return { kind: 'coach', value: outOf10, text, caption: 'Coach rating', label: null, tone: null }
  }
  return null
}

/** Average UpForge score over matches that have one. Coach ratings are never mixed in. */
export function averageMatchScore(items: ReadonlyArray<MatchScoreInput>): { value: number; count: number; tone: ScoreTone; label: string } | null {
  const vals = items.map(i => i.upforge_score).filter((s): s is number => s != null && Number.isFinite(s))
  if (!vals.length) return null
  const value = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
  return { value, count: vals.length, ...scoreTier(value) }
}
