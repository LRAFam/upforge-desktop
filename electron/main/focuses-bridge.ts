/**
 * Several focuses per game (API /api/focuses): turns what the renderer asks and what the API
 * answers into safe, typed values. Pure, so the rules are tested without Electron.
 */
import type { FocusesResult, FocusesState } from '../../src/lib/focuses'

const FOCUS_GAMES = new Set(['valorant', 'lol', 'deadlock', 'cs2'])
/** Refusal codes the renderer understands. Anything else from the API is reported as "unavailable". */
const KNOWN_ERRORS = new Set(['limit_reached', 'already_active', 'no_data', 'nothing_to_aim_for', 'invalid_target', 'unknown_metric', 'unsupported_game', 'not_found'])

export function isFocusGame(game: unknown): game is string {
  return typeof game === 'string' && FOCUS_GAMES.has(game)
}

export type AddFocusRequest = { ok: true; body: { game: string; metric: string; target?: number } } | { ok: false; error: string }

/** What the renderer may send to add a focus. A refusal here never reaches the API. */
export function parseAddFocus(payload: unknown): AddFocusRequest {
  const { game, metric, target } = (payload ?? {}) as { game?: unknown; metric?: unknown; target?: unknown }
  if (!isFocusGame(game)) return { ok: false, error: 'unsupported_game' }
  if (typeof metric !== 'string' || !/^[a-z0-9_]{1,48}$/.test(metric)) return { ok: false, error: 'unknown_metric' }
  if (target == null) return { ok: true, body: { game, metric } }
  if (typeof target !== 'number' || !Number.isFinite(target) || target < 0) return { ok: false, error: 'invalid_target' }
  return { ok: true, body: { game, metric, target } }
}

export function isFocusId(id: unknown): id is number {
  return Number.isInteger(id) && (id as number) > 0
}

function stateOf(data: unknown): FocusesState | null {
  const d = data as { game?: unknown; max_active?: unknown; focuses?: unknown; options?: unknown; recent?: unknown } | null
  if (!d || !Array.isArray(d.focuses) || !Array.isArray(d.options)) return null
  return {
    game: typeof d.game === 'string' ? d.game : '',
    max_active: Number.isInteger(d.max_active) && (d.max_active as number) > 0 ? d.max_active as number : 1,
    focuses: d.focuses,
    options: d.options,
    recent: Array.isArray(d.recent) ? d.recent : [],
  }
}

/**
 * The API's answer for the renderer. A server without /api/focuses (404, no error code) is
 * "unavailable": the app then keeps its single-focus screens. Raw error bodies never cross over.
 */
export function focusesReply(response: { status: number; data: unknown } | null): FocusesResult {
  if (!response) return { ok: false, error: 'network_error' }
  const data = response.data as { success?: unknown; error?: unknown } | null
  const state = stateOf(data)
  if ((response.status === 200 || response.status === 201) && data?.success === true && state) return { ok: true, ...state }
  const code = typeof data?.error === 'string' && KNOWN_ERRORS.has(data.error) ? data.error : null
  const error = code ?? (response.status === 401 ? 'signed_out' : 'unavailable')
  return state ? { ok: false, error, state } : { ok: false, error }
}
