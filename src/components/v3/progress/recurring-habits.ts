/** Shapes knowledge-bank insights into "What keeps coming up" rows (v3 Progress). Pure, tested. */
export interface RecurringInsightLike {
  id: number
  label: string | null
  text: string
  occurrences: number
  status: string | null
  trend: string | null
  lastSeenAt: string | null
}

export type HabitTrendTone = 'better' | 'worse' | 'steady' | null

export interface RecurringHabitRow {
  id: number
  title: string
  detail: string | null
  seen: string
  lastSeen: string | null
  trend: { label: string; tone: HabitTrendTone } | null
}

const MAX_ROWS = 5
const MAX_TITLE = 90

function firstSentence(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ')
  const cut = t.search(/[.!?](\s|$)/)
  const s = cut > 0 ? t.slice(0, cut + 1) : t
  return s.length > MAX_TITLE ? `${s.slice(0, MAX_TITLE - 1).trimEnd()}…` : s
}

export function relativeDays(iso: string | null, now = Date.now()): string | null {
  if (!iso) return null
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return null
  const days = Math.floor((now - at) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  const months = Math.floor(days / 30)
  return months === 1 ? 'a month ago' : `${months} months ago`
}

function trendOf(trend: string | null, status: string | null): RecurringHabitRow['trend'] {
  if (trend === 'improving' || status === 'improving') return { label: 'Coming up less', tone: 'better' }
  if (trend === 'worsening') return { label: 'Coming up more', tone: 'worse' }
  if (trend === 'stable') return { label: 'Steady', tone: 'steady' }
  return null
}

/** Open habits only (resolved ones are wins, not "keeps coming up"), most recurring first, at most 5. */
export function recurringHabitRows(rows: readonly RecurringInsightLike[] | null | undefined, now = Date.now()): RecurringHabitRow[] {
  if (!rows?.length) return []
  return rows
    .filter(r => r.status !== 'resolved' && r.occurrences >= 2 && (r.label || r.text.trim()))
    .sort((a, b) => b.occurrences - a.occurrences)
    .slice(0, MAX_ROWS)
    .map(r => {
      const title = r.label?.trim() || firstSentence(r.text)
      const detail = r.label && r.text.trim() ? firstSentence(r.text) : null
      return {
        id: r.id,
        title,
        detail: detail && detail !== title ? detail : null,
        // Whole numbers only (copy rule): a count of analysed matches the coach flagged it in.
        seen: `Flagged in ${r.occurrences} analysed ${r.occurrences === 1 ? 'match' : 'matches'}`,
        lastSeen: relativeDays(r.lastSeenAt, now),
        trend: trendOf(r.trend, r.status),
      }
    })
}

/** Apply statuses the player just set (before the next refresh), so a "fixed" habit leaves the list at once. */
export function withLocalStatuses<T extends RecurringInsightLike>(rows: readonly T[] | null | undefined, local: ReadonlyMap<number, string>): T[] {
  if (!rows?.length) return []
  return rows.map(r => (local.has(r.id) ? { ...r, status: local.get(r.id) ?? r.status } : r))
}
