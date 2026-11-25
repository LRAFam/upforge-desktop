/**
 * Matches search and filters: free text (map, agent, mode, result, date such as "22 Nov" or
 * "November"), a played-date window, the game mode, and recorded or not. Pure helpers so the list,
 * its counts and the saved filter state agree. The saved state lives for the app session only.
 */
export type MatchPeriod = 'any' | '7d' | '30d' | '90d' | 'older'
export type RecordedFilter = 'all' | 'recorded' | 'not_recorded'

export interface MatchSearchState {
  query: string
  period: MatchPeriod
  /** A mode label as rows show it ("Competitive", "Premier · Ranked"), or '' for every mode. */
  mode: string
  recorded: RecordedFilter
}

export const DEFAULT_MATCH_SEARCH: MatchSearchState = { query: '', period: 'any', mode: '', recorded: 'all' }

export const periodItems: { key: MatchPeriod; label: string }[] = [
  { key: 'any', label: 'Any time' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: '90d', label: 'Last 3 months' },
  { key: 'older', label: 'Older than 3 months' },
]

const PERIODS = new Set<MatchPeriod>(periodItems.map(p => p.key))
const RECORDED = new Set<RecordedFilter>(['all', 'recorded', 'not_recorded'])
const DAY = 86_400_000

export function inPeriod(playedMs: number, period: MatchPeriod, now = Date.now()): boolean {
  if (period === 'any') return true
  // Unknown dates only show under "Any time": we can't say they're recent or old.
  if (!playedMs) return false
  const age = now - playedMs
  if (period === '7d') return age <= 7 * DAY
  if (period === '30d') return age <= 30 * DAY
  if (period === '90d') return age <= 90 * DAY
  return age > 90 * DAY
}

/** Date words a player might type for a match: "22 nov", "22 november", "november", "2026", "saturday". */
export function dateWords(playedMs: number): string {
  if (!playedMs) return ''
  const d = new Date(playedMs)
  const day = d.getDate()
  const short = d.toLocaleDateString('en-GB', { month: 'short' })
  const long = d.toLocaleDateString('en-GB', { month: 'long' })
  const weekday = d.toLocaleDateString('en-GB', { weekday: 'long' })
  return [`${day} ${short}`, `${day} ${long}`, long, String(d.getFullYear()), weekday, `${day}/${d.getMonth() + 1}`].join(' ')
}

export interface SearchableRow {
  map?: string | null
  agent?: string | null
  mode?: string | null
  result?: string | null
  game?: string | null
  playedMs: number
}

export function searchHaystack(row: SearchableRow): string {
  return [row.map, row.agent, row.mode, row.result, row.game, dateWords(row.playedMs)]
    .filter(Boolean).join(' ').toLowerCase()
}

/** Every word typed must appear somewhere in the row ("jett bind" finds Jett on Bind). */
export function matchesQuery(haystack: string, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return words.every(w => haystack.includes(w))
}

export function matchesSearch(
  row: SearchableRow & { recorded: boolean },
  state: MatchSearchState,
  now = Date.now(),
): boolean {
  if (state.recorded === 'recorded' && !row.recorded) return false
  if (state.recorded === 'not_recorded' && row.recorded) return false
  if (state.mode && (row.mode ?? '') !== state.mode) return false
  if (!inPeriod(row.playedMs, state.period, now)) return false
  return !state.query.trim() || matchesQuery(searchHaystack(row), state.query)
}

export function searchActive(state: MatchSearchState): boolean {
  return !!state.query.trim() || state.period !== 'any' || !!state.mode || state.recorded !== 'all'
}

export const MATCH_SEARCH_KEY = 'uf.matchesSearch'

/** Saved filters (and the status chip) for the session; anything unexpected falls back to the defaults. */
export function readMatchSearch(storage: Pick<Storage, 'getItem'> | null | undefined): MatchSearchState & { status?: string } {
  try {
    const raw = JSON.parse(storage?.getItem(MATCH_SEARCH_KEY) || 'null') as Record<string, unknown> | null
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_MATCH_SEARCH }
    return {
      query: typeof raw.query === 'string' ? raw.query.slice(0, 120) : '',
      period: PERIODS.has(raw.period as MatchPeriod) ? raw.period as MatchPeriod : 'any',
      mode: typeof raw.mode === 'string' ? raw.mode.slice(0, 80) : '',
      recorded: RECORDED.has(raw.recorded as RecordedFilter) ? raw.recorded as RecordedFilter : 'all',
      ...(typeof raw.status === 'string' ? { status: raw.status } : {}),
    }
  } catch {
    return { ...DEFAULT_MATCH_SEARCH }
  }
}

export function saveMatchSearch(storage: Pick<Storage, 'setItem'> | null | undefined, state: MatchSearchState & { status?: string }): void {
  try {
    storage?.setItem(MATCH_SEARCH_KEY, JSON.stringify(state))
  } catch {
    // storage blocked: filters still work, they just aren't kept
  }
}
