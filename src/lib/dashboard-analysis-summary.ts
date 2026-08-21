import type { AnalysisItem } from '../env.d.ts'

type MatchSummary = Pick<AnalysisItem, 'rounds_won' | 'rounds_lost' | 'kills' | 'deaths' | 'assists'>

export function analysisScoreLine(analysis: MatchSummary): string | null {
  if (analysis.rounds_won == null || analysis.rounds_lost == null) return null
  return `${analysis.rounds_won} – ${analysis.rounds_lost}`
}

export function analysisKdaLine(analysis: MatchSummary): string | null {
  if (analysis.kills == null || analysis.deaths == null || analysis.assists == null) return null
  return `${analysis.kills} / ${analysis.deaths} / ${analysis.assists}`
}
