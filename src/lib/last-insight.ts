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

const TEXT_KEYS = ['text', 'issue', 'title', 'summary', 'fix'] as const

/**
 * One line of coaching text from an AI field. Valorant/CS2 send strings; League sends
 * `priority_improvements` as `{ theme, issue, fix }` objects. Arrays use their first usable entry.
 * Objects without a text field give null (never "[object Object]").
 */
export function insightText(raw: unknown): string | null {
  if (typeof raw === 'string') return raw.trim() || null
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const text = insightText(item)
      if (text) return text
    }
    return null
  }
  if (raw && typeof raw === 'object') {
    const row = raw as Record<string, unknown>
    for (const key of TEXT_KEYS) {
      const value = row[key]
      if (typeof value === 'string' && value.trim()) return value.trim()
    }
  }
  return null
}

/** A saved/received last insight with string `text`, or null when it has none (older builds saved objects). */
export function normalizeLastInsight(raw: unknown): LastInsight | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const saved = raw as Partial<LastInsight> & { text?: unknown }
  const text = insightText(saved.text)
  if (!text) return null
  return saved.text === text ? (saved as LastInsight) : { ...(saved as LastInsight), text }
}
