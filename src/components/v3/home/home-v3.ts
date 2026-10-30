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
 * the latest focus-loop note first, then the last analysis insight. Never invents a claim.
 */
export interface CoachLastMatch {
  won: boolean | null
  mapLabel: string | null
  roundsWon: number | null
  roundsLost: number | null
}

export function coachLine(
  latest: FocusUpdate | null | undefined,
  lastInsight: { text: string } | null | undefined,
  lastMatch?: CoachLastMatch | null,
): { headline: string; next: string; source: 'focus_note' | 'insight' | 'last_match' } | null {
  const notes = latest?.report?.notes
  if (notes?.headline?.text) {
    return { headline: notes.headline.text, next: notes.next_action?.text ?? notes.subline?.text ?? '', source: 'focus_note' }
  }
  if (lastInsight?.text) return { headline: lastInsight.text, next: '', source: 'insight' }
  // Accounts with analysed matches but no note yet: speak about the real last match, never "set up recording".
  if (lastMatch) {
    const where = lastMatch.mapLabel ? ` on ${lastMatch.mapLabel}` : ''
    const score = lastMatch.roundsWon != null && lastMatch.roundsLost != null ? `, ${lastMatch.roundsWon}–${lastMatch.roundsLost}` : ''
    const headline = lastMatch.won == null
      ? `Your last match${where} is analysed${score ? ` (${score.slice(2)})` : ''}.`
      : `Your last match was a ${lastMatch.won ? 'win' : 'loss'}${where}${score}.`
    return { headline, next: 'Open it to see what decided it.', source: 'last_match' }
  }
  return null
}

/** Full-body agent art from the same CDN entry the app already uses for the bust icon. */
export function agentFullPortrait(displayIcon: string): string {
  return displayIcon ? displayIcon.replace(/\/displayicon\.png$/, '/fullportrait.png') : ''
}

export function relativeDay(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const mins = Math.max(0, Math.round((now - t) / 60000))
  if (mins < 60) return mins <= 1 ? 'just now' : `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return days === 1 ? 'yesterday' : `${days} days ago`
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
  analyses: ReadonlyArray<{ created_at?: string | null }>,
  now = Date.now(),
): HomeStateNote | null {
  const times = analyses.map(a => Date.parse(a.created_at ?? '')).filter(t => Number.isFinite(t))
  if (!times.length) return null
  const days = Math.floor((now - Math.max(...times)) / 86_400_000)
  if (days >= RETURNING_AFTER_DAYS) {
    return {
      kind: 'returning',
      label: 'Welcome back',
      line: `Your last analysed match was ${days} days ago. Play one and your coach picks up where you left off.`,
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
