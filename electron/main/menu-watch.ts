/**
 * Pure transition helper for "wait until player leaves the map".
 * Used by RiotLocalApi.watchUntilMenus — extracted for unit tests.
 */

export type MenuWatchLoop = 'MENUS' | 'PREGAME' | 'INGAME' | 'UNKNOWN' | string

export interface MenuWatchState {
  sawIngame: boolean
  lastLoop: string | null
}

export interface MenuWatchTickResult {
  state: MenuWatchState
  /** True when the player has left a real INGAME session for MENUS. */
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
      state: { sawIngame: true, lastLoop: 'INGAME' },
      returnedToMenus: false,
    }
  }

  // Ignore PREGAME transitions for lastLoop so agent-select back-outs don't
  // look like "left INGAME → MENUS" after a brief lobby flash.
  if (loop === 'PREGAME') {
    return { state: prev, returnedToMenus: false }
  }

  return {
    state: { sawIngame: prev.sawIngame, lastLoop: loop },
    returnedToMenus: false,
  }
}
