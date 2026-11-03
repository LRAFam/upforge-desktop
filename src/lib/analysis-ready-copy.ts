/**
 * Text for the "Coaching ready" notification and activity line. Pure (used by the main process).
 * Scores follow `matchScore`: the stats UpForge score out of 1000, else "Coach rating 7/10" — never "/100".
 */
import { matchScore } from './upforge-score'

/** "UpForge score 640" · "Coach rating 7/10" · null when the result has neither. */
export function analysisScoreText(result: { upforge_score?: unknown; overall_score?: unknown } | null | undefined): string | null {
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const s = matchScore({ upforge_score: num(result?.upforge_score), overall_score: num(result?.overall_score) })
  return s ? `${s.caption} ${s.text}` : null
}

/** "Jett on Ascent · Coach rating 7/10" (agent/hero falls back to the game name). */
export function coachingReadyBody(who: string, map: string | null | undefined, result: { upforge_score?: unknown; overall_score?: unknown } | null | undefined): string {
  const head = `${who}${map ? ` on ${map}` : ''}`.trim()
  const score = analysisScoreText(result)
  return score ? `${head} · ${score}` : head
}
