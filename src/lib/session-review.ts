import { buildCoachMemoryLine, type SkillProfileSnapshot } from './skill-profile'
import { scoreGrade } from './analysis-scoring'

export interface SessionReviewInput {
  overall_score: number | null
  won?: boolean | null
  status?: string | null
  hs_pct?: number | null
}

export interface SessionReviewSummary {
  count: number
  wins: number
  losses: number
  wl: Array<boolean | null | undefined>
  avgScore: number | null
  grade: string | null
  trend: number | null
  avgHs: number | null
  fixThisWeek: string | null
}

export function buildSessionReview(
  analyses: SessionReviewInput[],
  skillProfile?: SkillProfileSnapshot | null,
  maxGames = 8,
  fixOverride?: string | null,
): SessionReviewSummary | null {
  const recent = analyses
    .filter((a) => a.overall_score != null && (a.status == null || a.status === 'completed'))
    .slice(0, maxGames)

  if (recent.length < 3) return null

  const wins = recent.filter((a) => a.won === true).length
  const losses = recent.filter((a) => a.won === false).length
  const scores = recent.map((a) => a.overall_score!).filter((s) => typeof s === 'number')
  const avgScore = scores.length ? scores.reduce((sum, s) => sum + s, 0) / scores.length : null
  const grade = avgScore != null ? scoreGrade(avgScore) : null

  const mid = Math.max(1, Math.floor(scores.length / 2))
  const newer = scores.slice(0, mid)
  const older = scores.slice(mid)
  const newerAvg = newer.length ? newer.reduce((a, b) => a + b, 0) / newer.length : null
  const olderAvg = older.length ? older.reduce((a, b) => a + b, 0) / older.length : null
  const trend = newerAvg != null && olderAvg != null ? newerAvg - olderAvg : null

  const hsItems = recent.filter((a) => a.hs_pct != null)
  const avgHs = hsItems.length
    ? Math.round(hsItems.reduce((s, a) => s + (a.hs_pct ?? 0), 0) / hsItems.length)
    : null

  const topIssueEntry = skillProfile
    ? Object.entries(skillProfile.issueCounts).sort((a, b) => b[1] - a[1])[0]
    : null
  const fixThisWeek = fixOverride
    ?? (topIssueEntry && topIssueEntry[1] >= 2
      ? `Work on ${topIssueEntry[0].replace(/_/g, ' ')} (${topIssueEntry[1]}× recently)`
      : buildCoachMemoryLine(skillProfile)?.focusNext ?? null)

  return {
    count: recent.length,
    wins,
    losses,
    wl: recent.map((a) => a.won),
    avgScore,
    grade,
    trend,
    avgHs,
    fixThisWeek,
  }
}
