/** Pure parsing of the habit fields /api/knowledge-bank added in API #1098 (kept out of auth-manager for tests). */

export interface HabitMoment { analysisId: number; round: number | null; ms: number | null }

export interface HabitDetails {
  exampleAnalysisId: number | null
  polarity: 'risk' | 'neutral' | 'strength' | null
  note: string | null
  exampleMoments: HabitMoment[]
}

const positiveId = (v: unknown): number | null => (Number.isSafeInteger(Number(v)) && Number(v) > 0 ? Number(v) : null)
const nonNegativeInt = (v: unknown): number | null => (v != null && Number.isSafeInteger(Number(v)) && Number(v) >= 0 ? Number(v) : null)

/** Polarity, whole note and example moments of one /api/knowledge-bank row (API #1098 fields). */
export function habitDetails(r: Record<string, unknown>): HabitDetails {
  const exampleMoments = (Array.isArray(r.example_moments) ? r.example_moments : [])
    .map((m: unknown) => {
      const o = m && typeof m === 'object' ? (m as Record<string, unknown>) : {}
      const analysisId = positiveId(o.analysis_id)
      return analysisId ? { analysisId, round: nonNegativeInt(o.round), ms: nonNegativeInt(o.ms) } : null
    })
    .filter((m): m is HabitMoment => m !== null)
    .slice(0, 5)
  const polarity = r.polarity === 'risk' || r.polarity === 'neutral' || r.polarity === 'strength' ? r.polarity : null
  const note = typeof r.note === 'string' && r.note.trim() ? r.note.trim().replace(/\s+/g, ' ') : null
  return {
    exampleAnalysisId: exampleMoments[0]?.analysisId ?? positiveId(r.example_analysis_id),
    polarity,
    note,
    exampleMoments,
  }
}
