/**
 * Pure transition helper for "wait until player leaves the map".
 * Used by RiotLocalApi.watchUntilMenus — extracted for unit tests.
 */

export type MenuWatchLoop = 'MENUS' | 'PREGAME' | 'INGAME' | 'UNKNOWN' | string

export interface MenuWatchState {
  sawIngame: boolean
  lastLoop: string | null
  /** Consecutive PREGAME polls after INGAME (a new agent select). */
  pregameAfterIngame?: number
}

/**
 * PREGAME polls in a row (2 s apart) after INGAME that end the wait. Players can queue from inside a
 * skipped match (the Range): INGAME → agent select → the next match, with no MENUS in between, so
 * waiting for MENUS missed that whole next match (first Swiftplay of 2 Nov 2026 was not recorded).
 * Two polls rather than one so a single stray PREGAME reading cannot end the wait.
 */
export const PREGAME_POLLS_TO_END_WAIT = 2

export interface MenuWatchTickResult {
  state: MenuWatchState
  /** True when the player has left a real INGAME session (for MENUS, or into the next agent select). */
  returnedToMenus: boolean
}

/**
 * Apply one presence poll to the menu-watch state machine.
 *
 * Missing/unknown session state must NOT be treated as MENUS — that falsely
 * ends the wait while the player is still on the map and re-arms recording
 * (causing repeated failure toasts/beeps when OBS is down).
 */
export function applyMenuWatchTick(
  prev: MenuWatchState,
  loop: MenuWatchLoop | null | undefined,
): MenuWatchTickResult {
  if (loop == null || loop === '' || loop === 'UNKNOWN') {
    return { state: prev, returnedToMenus: false }
  }

  if (prev.sawIngame && prev.lastLoop === 'INGAME' && loop === 'MENUS') {
    return {
      state: { sawIngame: true, lastLoop: 'MENUS' },
      returnedToMenus: true,
    }
  }

  if (loop === 'INGAME') {
    return {
      state: { sawIngame: true, lastLoop: 'INGAME', pregameAfterIngame: 0 },
      returnedToMenus: false,
    }
  }

  // Ignore PREGAME transitions for lastLoop so agent-select back-outs don't
  // look like "left INGAME → MENUS" after a brief lobby flash.
  if (loop === 'PREGAME') {
    if (!prev.sawIngame || prev.lastLoop !== 'INGAME') return { state: prev, returnedToMenus: false }
    const pregameAfterIngame = (prev.pregameAfterIngame ?? 0) + 1
    if (pregameAfterIngame >= PREGAME_POLLS_TO_END_WAIT) {
      return { state: { sawIngame: true, lastLoop: 'PREGAME' }, returnedToMenus: true }
    }
    return { state: { ...prev, pregameAfterIngame }, returnedToMenus: false }
  }

  return {
    state: { sawIngame: prev.sawIngame, lastLoop: loop },
    returnedToMenus: false,
  }
}
