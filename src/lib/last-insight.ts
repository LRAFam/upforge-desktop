/**
 * The "last coaching insight" is saved once per account (settings.lastInsight). It belongs to the
 * game of the analysis that produced it, so it must only show while that game is selected.
 */
export interface LastInsight {
  text: string
  score: number
  agent: string | null
  analysisId: number | null
  date: string
  /** Missing on entries saved before 3.2.4; those all came from Valorant analyses. */
  game?: string
}

export function lastInsightGame(insight: Pick<LastInsight, 'game'>): string {
  return insight.game || 'valorant'
}

export function insightForGame<T extends Pick<LastInsight, 'game'>>(insight: T | null | undefined, game: string): T | null {
  if (!insight) return null
  return lastInsightGame(insight) === game ? insight : null
}
