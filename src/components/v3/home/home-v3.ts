/** Pure helpers for the v3 Home screen (no Vue, no IPC) so the choices are testable. */
import type { AnalysisItem } from '../../../env.d.ts'
import type { FocusUpdate } from '../../../lib/focus'

export type HomePrimaryAction = 'setup_recording' | 'open_last_match' | 'check_matches'

/** The ONE red action on Home, chosen by what moves the player forward right now. */
export function pickPrimaryAction(s: { hasMatch: boolean; obsConnected: boolean; isValorant: boolean }): HomePrimaryAction {
  if (s.hasMatch) return 'open_last_match'
  if (!s.obsConnected) return 'setup_recording'
  return s.isValorant ? 'check_matches' : 'setup_recording'
}

export const PRIMARY_LABEL: Record<HomePrimaryAction, string> = {
  setup_recording: 'Set up recording',
  open_last_match: 'Open last match',
  check_matches: 'Check my matches',
}

/** "13–9" from the rounds the player's team won/lost, or null when the match has no round score. */
export function heroScore(a: Pick<AnalysisItem, 'rounds_won' | 'rounds_lost'> | null | undefined): { won: number; lost: number } | null {
  if (!a || a.rounds_won == null || a.rounds_lost == null) return null
  return { won: a.rounds_won, lost: a.rounds_lost }
}

export function resultTone(won: boolean | null | undefined): 'win' | 'loss' | 'none' {
  return won === true ? 'win' : won === false ? 'loss' : 'none'
}

export function resultWord(won: boolean | null | undefined): string {
  return won === true ? 'VICTORY' : won === false ? 'DEFEAT' : ''
}

/**
 * The coach's one sentence and its next step. Only uses text the API already produced:
 * the latest focus-loop note first, then the AI verdict of the last match (what decided it),
 * then the last analysis insight. Never invents a claim, and never repeats the hero's
 * result line (map, result and score are already in the hero).
 */
export interface CoachLastMatch {
  /** The analysis `verdict` the AI wrote for this match, when there is one. */
  verdict: string | null
}

export function coachLine(
  latest: FocusUpdate | null | undefined,
  lastInsight: { text: string } | null | undefined,
  lastMatch?: CoachLastMatch | null,
): { headline: string; next: string; source: 'focus_note' | 'verdict' | 'insight' | 'last_match' } | null {
  const notes = latest?.report?.notes
  if (notes?.headline?.text) {
    return { headline: notes.headline.text, next: notes.next_action?.text ?? notes.subline?.text ?? '', source: 'focus_note' }
  }
  const verdict = lastMatch?.verdict?.trim()
  if (verdict) return { headline: verdict, next: '', source: 'verdict' }
  if (lastInsight?.text) return { headline: lastInsight.text, next: '', source: 'insight' }
  // Analysed match but no AI text yet: point at it without restating the hero's result.
  if (lastMatch) return { headline: 'Open your last match to see what decided it.', next: '', source: 'last_match' }
  return null
}

/** Full-body agent art from the same CDN entry the app already uses for the bust icon. */
export function agentFullPortrait(displayIcon: string): string {
  return displayIcon ? displayIcon.replace(/\/displayicon\.png$/, '/fullportrait.png') : ''
}

/** Whole days since `iso` (rounded, same rule as `relativeDay`); null for a missing/bad date. */
export function daysAgo(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  const hours = Math.round(Math.max(0, Math.round((now - t) / 60000)) / 60)
  return Math.round(hours / 24)
}

/** The one relative-date formatter on Home (hero, Recent, the welcome-back note). */
export function relativeDay(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const mins = Math.max(0, Math.round((now - t) / 60000))
  if (mins < 60) return mins <= 1 ? 'just now' : `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = daysAgo(iso, now)!
  return days === 1 ? 'yesterday' : `${days} days ago`
}

/**
 * One row per real match. The API returns one row per analysis, so a match analysed again
 * (same Riot match_id, new analysis id) shows up several times. Rows arrive newest first;
 * keep the newest analysis of each match. Rows without a match_id are kept as they are.
 */
export function dedupeByMatch<T extends { id: number | string; match_id?: string | null }>(items: readonly T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const a of items) {
    const key = a.match_id ? `m:${a.match_id}` : `a:${a.id}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(a)
  }
  return out
}

type FormMatch = Pick<AnalysisItem, 'won' | 'map' | 'rounds_won' | 'rounds_lost' | 'overall_score' | 'hs_pct'>

/** Hover/aria label for one recent-form square: "Summit · 13–10 · Win". */
export function formSquareLabel(a: FormMatch, mapLabel: (map: string) => string): string {
  const result = a.won === true ? 'Win' : a.won === false ? 'Loss' : 'Result unknown'
  const score = a.rounds_won != null && a.rounds_lost != null ? `${a.rounds_won}–${a.rounds_lost}` : null
  return [a.map ? mapLabel(a.map) : 'Match', score, result].filter(Boolean).join(' · ')
}

/** Display map name per game: "Vertigo" for de_vertigo, Valorant names through the app's helper. */
export function homeMapLabel(game: string, map: string | null | undefined, valorantLabel: (m: string) => string): string {
  if (!map) return ''
  if (game === 'cs2') {
    const base = map.trim().toLowerCase().split(/[\\/]/).pop() ?? ''
    const name = base.replace(/^(de|cs)_/, '').replace(/_/g, ' ')
    return name.replace(/\b\w/g, c => c.toUpperCase())
  }
  return valorantLabel(map)
}

/**
 * Hero meta line. CS2 rows carry the player's own name in `agent` and a source label
 * ("CS2 VOD") in `game_mode`; neither tells the player anything, so they're left out.
 */
/** When the match was played: the API's played_at, else when it was analysed. */
export function matchTime(a: { played_at?: string | null; created_at?: string | null }): string | null {
  return a.played_at || a.created_at || null
}

export function heroMetaParts(
  game: string,
  a: Pick<AnalysisItem, 'map' | 'agent' | 'game_mode' | 'created_at' | 'played_at'>,
  mapLabel: string,
  formatMode: (m: string | null | undefined) => string,
): string[] {
  const demo = game === 'cs2' || game === 'deadlock'
  return [
    mapLabel || null,
    game === 'cs2' ? null : a.agent,
    demo ? null : formatMode(a.game_mode),
    relativeDay(matchTime(a)),
  ].filter((x): x is string => !!x)
}

/** Focus title split for the type roles: the habit in Plex, the short goal in the display face. */
export function focusTitleParts(f: { label: string; better: 'lower' | 'higher'; target: number; progress: { status: string } }): { title: string; goal: string } {
  const goal = `${f.better === 'lower' ? 'At most' : 'At least'} ${Math.round(f.target * 100)}%`  // same words as the starting report
  const s = f.progress.status
  const title = s === 'achieved' ? `Focus achieved: ${f.label.toLowerCase()}` : s === 'missed' ? `Not this time: ${f.label.toLowerCase()}` : f.label
  return { title, goal }
}

/** Live pipeline state the dashboard already tracks (recording → upload → AI analysis). */
export interface HomeLiveState {
  recording: boolean
  recordingStarting?: boolean
  waitingForMatch: boolean
  elapsed?: string
  uploadPct: number | null
  uploads: number
  analysisPct: number | null
  analyses: number
}

export interface HomeLiveStatus {
  kind: 'recording' | 'starting' | 'working' | 'waiting'
  text: string
  /** stop = stop the recording; matches = follow progress in Matches; null = nothing to open. */
  action: 'stop' | 'matches' | null
}

/** One quiet line while something is happening; null when the pipeline is idle. */
export function liveStatus(s: HomeLiveState): HomeLiveStatus | null {
  if (s.recording) return { kind: 'recording', text: s.elapsed ? `Recording · ${s.elapsed}` : 'Recording', action: 'stop' }
  if (s.recordingStarting) return { kind: 'starting', text: 'Starting recording…', action: null }
  const parts: string[] = []
  if (s.uploadPct != null) parts.push(`Uploading · ${Math.round(s.uploadPct)}%`)
  else if (s.uploads > 0) parts.push(s.uploads === 1 ? 'Uploading 1 recording' : `Uploading ${s.uploads} recordings`)
  if (s.analyses === 1) parts.push(s.analysisPct != null ? `Coach is analysing · ${Math.round(s.analysisPct)}%` : 'Coach is analysing your match')
  else if (s.analyses > 1) parts.push(`Coach is analysing ${s.analyses} matches`)
  if (parts.length) return { kind: 'working', text: parts.join(' · '), action: 'matches' }
  if (s.waitingForMatch) return { kind: 'waiting', text: 'Game open · recording starts when the match loads', action: null }
  return null
}

/** Analysed matches created in the last 7 days. */
export function analysedThisWeek(items: Array<{ created_at?: string | null }>, now = Date.now()): number {
  const weekAgo = now - 7 * 86_400_000
  return items.filter(a => {
    const t = a.created_at ? new Date(a.created_at).getTime() : NaN
    return Number.isFinite(t) && t > weekAgo && t <= now
  }).length
}

/** Board 13 · Home when data is thin or the player has been away. Real dates and counts only. */
export interface HomeStateNote { kind: 'early_read' | 'returning'; label: string; line: string }

const EARLY_READ_UNDER = 10
const RETURNING_AFTER_DAYS = 14

export function homeStateNote(
  analyses: ReadonlyArray<{ created_at?: string | null; played_at?: string | null }>,
  now = Date.now(),
): HomeStateNote | null {
  const times = analyses.map(a => Date.parse(matchTime(a) ?? '')).filter(t => Number.isFinite(t))
  if (!times.length) return null
  const newest = new Date(Math.max(...times)).toISOString()
  const days = daysAgo(newest, now) ?? 0
  if (days >= RETURNING_AFTER_DAYS) {
    return {
      kind: 'returning',
      label: 'Welcome back',
      line: `Your last analysed match was played ${relativeDay(newest, now)}. Play one and your coach picks up where you left off.`,
    }
  }
  if (times.length < EARLY_READ_UNDER) {
    const n = times.length
    return {
      kind: 'early_read',
      label: `Early read · ${n} ${n === 1 ? 'match' : 'matches'}`,
      line: `Numbers show how many matches they come from until you have ${EARLY_READ_UNDER}.`,
    }
  }
  return null
}
