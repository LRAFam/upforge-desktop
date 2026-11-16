/**
 * Several focuses per game (GET/POST/DELETE /api/focuses): what the player is working on, what
 * they could add, and what recently ended. Display rules only; the API decides and checks.
 */
import { focusSlots, type Focus } from './focus'

/** How a focus number is said: a share of something (0–1, shown as %), a count, or a rate. */
export type FocusUnit = 'share' | 'share_of_rounds' | 'share_of_deaths' | 'share_of_hits' | 'count' | 'rate' | string

export interface FocusItem extends Focus {
  game?: string
  unit?: FocusUnit | null
  status?: 'active' | 'achieved' | 'missed' | 'replaced' | string
  /** Who chose it: the coach (from a report) or the player. */
  origin?: 'coach' | 'player'
  /** What to practise for it (League); absent where the practice step is a trainer drill. */
  practice?: string | null
}

export interface FocusOption {
  metric: string
  label: string
  better: 'lower' | 'higher'
  unit: FocusUnit
  current: number
  matches: number
  target: number
  target_text: string
}

export interface FocusesState {
  game: string
  max_active: number
  focuses: FocusItem[]
  options: FocusOption[]
  recent: FocusItem[]
  /** Ranked matches in a row on target in this game, across consecutive focuses (newer API). */
  streak?: number
}

export type FocusesResult = ({ ok: true } & FocusesState) | { ok: false; error: string; state?: FocusesState }

/** Games with a focus loop on the server. */
export const FOCUS_GAMES = ['valorant', 'lol', 'deadlock'] as const
export function hasFocusLoop(game: string | null | undefined): boolean {
  return (FOCUS_GAMES as readonly string[]).includes(game ?? '')
}

const SHARE_OF: Record<string, string> = { share_of_rounds: ' of rounds', share_of_deaths: ' of deaths', share_of_hits: ' of hits' }
export function isShareUnit(unit: FocusUnit | null | undefined): boolean {
  return unit === 'share' || (typeof unit === 'string' && unit.startsWith('share_of_'))
}

function trimNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100)
}

/**
 * "24%" for a share, "5.1" for a count or rate. A focus from an older API has no unit: values up
 * to 1 on a 0–1 scale read as a share (every focus before units existed was one).
 */
export function formatFocusValue(value: number | null | undefined, unit: FocusUnit | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const share = unit == null ? value >= 0 && value <= 1 : isShareUnit(unit)
  return share ? `${Math.round(value * 100)}%` : trimNumber(value)
}

/** "At most 24% of rounds" / "At least 2.4" */
export function focusGoal(f: Pick<FocusItem, 'better' | 'target' | 'unit'>): string {
  return `${f.better === 'lower' ? 'At most' : 'At least'} ${formatFocusValue(f.target, f.unit)}${SHARE_OF[f.unit ?? ''] ?? ''}`
}

/** "1 of 2 on target · 2 games left", then how it ended. */
export function focusProgressLine(f: FocusItem): string {
  const p = f.progress
  const status = f.status ?? p.status
  if (status === 'achieved') return `Done: on target in ${p.hits} of ${p.games_played} games`
  if (status === 'missed') return `Not this time: on target in ${p.hits} of ${p.games_played} games`
  if (status === 'replaced') return p.games_played ? `Dropped after ${p.games_played} ${p.games_played === 1 ? 'game' : 'games'}` : 'Dropped before a game counted'
  const left = Math.max(0, p.games_required - p.games_played)
  if (p.games_played === 0) return `Starts with your next ranked game · on target in ${p.hits_required} of ${p.games_required} to pass`
  return `On target in ${p.hits} of ${p.games_played} so far · ${left} ${left === 1 ? 'game' : 'games'} left`
}

export function focusOriginLabel(f: Pick<FocusItem, 'origin'>): string {
  return f.origin === 'player' ? 'Your pick' : 'From your coach'
}

/** "Now 40% of rounds, aim for at most 24%" */
export function optionLine(o: FocusOption): string {
  const of = SHARE_OF[o.unit] ?? ''
  return `Now ${formatFocusValue(o.current, o.unit)}${of}, aim for ${o.better === 'lower' ? 'at most' : 'at least'} ${formatFocusValue(o.target, o.unit)}`
}

/**
 * A target the player typed. Shares are typed as a percent ("25" or "25%" → 0.25); counts and
 * rates as they are. Null when it is not a number, out of range, or no improvement on now.
 */
export function parseTargetInput(text: string, option: Pick<FocusOption, 'unit' | 'better' | 'current'>): number | null {
  const raw = text.trim().replace(/%$/, '').replace(',', '.').trim()
  if (!/^\d+(\.\d+)?$/.test(raw)) return null
  const typed = Number(raw)
  const share = isShareUnit(option.unit)
  const value = share ? Math.round(typed) / 100 : Math.round(typed * 10) / 10
  if (!Number.isFinite(value) || value < 0 || value > (share ? 1 : 999.9)) return null
  if (option.better === 'lower' ? value >= option.current : value <= option.current) return null
  return value
}

/** What to type into the target box by default, in the same unit the player types. */
export function targetInputValue(option: Pick<FocusOption, 'unit' | 'target'>): string {
  return isShareUnit(option.unit) ? String(Math.round(option.target * 100)) : trimNumber(option.target)
}

export function canAddFocus(state: Pick<FocusesState, 'focuses' | 'max_active' | 'options'> | null | undefined): boolean {
  return !!state && state.focuses.length < state.max_active && state.options.length > 0
}

/** Why nothing can be added right now, or null when something can. */
export function addBlockedLine(state: Pick<FocusesState, 'focuses' | 'max_active' | 'options'> | null | undefined): string | null {
  if (!state || canAddFocus(state)) return null
  if (state.focuses.length >= state.max_active) return `You can work on ${state.max_active} at once. Drop one to add another.`
  return state.focuses.length ? 'Nothing else to add right now.' : 'Play a few ranked matches and your choices appear here.'
}

/** Refusal codes from the API, in plain words. */
export function refusalText(code: string | null | undefined): string {
  switch (code) {
    case 'limit_reached': return 'You are already working on the most focuses allowed at once. Drop one first.'
    case 'already_active': return 'You are already working on that one.'
    case 'no_data': return 'There is not enough match data for that one yet.'
    case 'nothing_to_aim_for': return 'You are already at the best that one measures.'
    case 'invalid_target': return 'That target is not an improvement on where you are now.'
    case 'unknown_metric': case 'unsupported_game': return 'That focus is not available for this game.'
    case 'not_found': return 'That focus has already ended.'
    case 'signed_out': return 'Sign in to change your focuses.'
    default: return 'Couldn’t change your focuses. Check your connection and try again.'
  }
}

export { focusSlots }

/** One focus's result for one match, as report responses list them (focus_checks). */
export interface MatchFocusCheck {
  focus_id: number
  metric: string
  label: string
  better: 'lower' | 'higher'
  unit?: FocusUnit | null
  target: number
  value: number
  hit: boolean
  status?: string
}

/** "Opening deaths: 10% of rounds (target at most 24%)" plus whether it was on target. */
export function matchCheckLine(c: MatchFocusCheck): { label: string; detail: string; hit: boolean } {
  const of = SHARE_OF[c.unit ?? ''] ?? ''
  return {
    label: c.label,
    detail: `${formatFocusValue(c.value, c.unit)}${of} · target ${c.better === 'lower' ? 'at most' : 'at least'} ${formatFocusValue(c.target, c.unit)}`,
    hit: c.hit,
  }
}

/** Keeps only well-formed rows: the list comes from the API and older servers send none. */
export function sanitizeMatchChecks(value: unknown): MatchFocusCheck[] {
  if (!Array.isArray(value)) return []
  return value.filter((c): c is MatchFocusCheck => !!c && typeof c === 'object'
    && typeof (c as MatchFocusCheck).label === 'string'
    && Number.isFinite((c as MatchFocusCheck).value)
    && Number.isFinite((c as MatchFocusCheck).target)
    && typeof (c as MatchFocusCheck).hit === 'boolean'
    && ((c as MatchFocusCheck).better === 'lower' || (c as MatchFocusCheck).better === 'higher')).slice(0, 6)
}
