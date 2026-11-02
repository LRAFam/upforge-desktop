/** Shapes knowledge-bank insights into "What keeps coming up" rows (v3 Progress). Pure, tested. */
export interface RecurringInsightLike {
  id: number
  label: string | null
  text: string
  occurrences: number
  analysisCount?: number | null
  status: string | null
  trend: string | null
  lastSeenAt: string | null
}

export type HabitTrendTone = 'better' | 'worse' | 'steady' | null

export interface RecurringHabitRow {
  id: number
  title: string
  detail: string | null
  /** Maps the habit was seen on (from the API text), at most a few. */
  maps: string[]
  seen: string
  lastSeen: string | null
  trend: { label: string; tone: HabitTrendTone } | null
}

const MAX_ROWS = 5
const MAX_TITLE = 90

const MAX_DETAIL = 160

function firstSentence(text: string, max = MAX_TITLE): string {
  const t = text.trim().replace(/\s+/g, ' ')
  const cut = t.search(/[.!?](\s|$)/)
  const s = cut > 0 ? t.slice(0, cut + 1) : t
  return s.length > max ? `${s.slice(0, max - 1).replace(/\s+\S*$/, '').replace(/[,;:—-]$/, '').trimEnd()}…` : s
}

/**
 * The API stores merged habits as "{label} — flagged across N analyses (T sightings). {coach note} Maps: A, B…."
 * (KnowledgeBankHabitSynthesizer). N there counts merged insight rows, not analyses, so the prefix is dropped;
 * T is the same number as occurrence_count. Returns the coach's own note (cut at a word, never mid-word)
 * and the maps it was seen on.
 */
export function parseHabitText(text: string): { note: string; maps: string[] } {
  let t = text.trim().replace(/\s+/g, ' ')
  t = t.replace(/^[^.]*?\s+[—-]\s+flagged across \d+ analys[ie]s \(\d+ sightings?\)\.\s*/i, '')
  let maps: string[] = []
  const m = t.match(/\s*Maps: ([^.]*?)(?:…|\.\.\.)?\.?$/)
  if (m && m.index != null) {
    maps = m[1].split(',').map(x => x.trim()).filter(Boolean)
    t = t.slice(0, m.index).trim()
  }
  // The API truncates the note with "..." (often mid-word): cut back to the last whole word.
  if (/\.\.\.$/.test(t)) t = `${t.slice(0, -3).replace(/\s+\S*$/, '').replace(/[,;:—(-]$/, '').trimEnd()}…`
  return { note: t, maps }
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

/** "Flagged in 2 matches · 3 times" when the API counts matches; older habits only know "times". */
export function habitSeen(occurrences: number, analysisCount?: number | null): string {
  const times = `${occurrences} ${occurrences === 1 ? 'time' : 'times'}`
  if (analysisCount == null || analysisCount <= 0) return `Flagged ${times}`
  const matches = `${analysisCount} ${analysisCount === 1 ? 'match' : 'matches'}`
  return analysisCount === occurrences ? `Flagged in ${matches}` : `Flagged in ${matches} · ${times}`
}

/** Open habits only (resolved ones are wins, not "keeps coming up"), most recurring first, at most 5. */
export function recurringHabitRows(rows: readonly RecurringInsightLike[] | null | undefined, now = Date.now()): RecurringHabitRow[] {
  if (!rows?.length) return []
  return rows
    .filter(r => r.status !== 'resolved' && r.occurrences >= 2 && (r.label || r.text.trim()))
    .sort((a, b) => b.occurrences - a.occurrences)
    .slice(0, MAX_ROWS)
    .map(r => {
      const { note, maps } = parseHabitText(r.text)
      const title = r.label?.trim() || firstSentence(note)
      const detail = r.label && note ? firstSentence(note, MAX_DETAIL) : null
      return {
        id: r.id,
        title,
        // One plain line: the coach's latest note for this habit, never the title again.
        detail: detail && detail.toLowerCase() !== title.toLowerCase() ? detail : null,
        maps,
        // Whole numbers only (copy rule). occurrence_count goes up once per coach finding, and one
        // analysed match can add more than one, so it is "times", not "matches".
        seen: habitSeen(r.occurrences, r.analysisCount),
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
