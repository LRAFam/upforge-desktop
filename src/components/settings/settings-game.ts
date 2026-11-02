/**
 * Settings follows the title-bar game (cross-game pass 2026-11-02). Pure helpers so they can be unit-tested.
 */
import type { PrimaryGame } from '../../lib/games'

interface GameFields {
  primaryGame?: string
  trainerMouse: { game: string }
}

/**
 * Mirror a title-bar game switch into the Settings copy. The switch already saved `primaryGame` and
 * `trainerMouse.game` (usePrimaryGame.setPrimaryGame); without this the open Settings screen keeps showing
 * the old game's blocks (CS2 demo folder, Deadlock diagnostics) and its next save writes the old game back.
 * Returns true when something changed.
 */
export function followSelectedGame(settings: GameFields, game: PrimaryGame): boolean {
  if (settings.primaryGame === game) return false
  settings.primaryGame = game
  settings.trainerMouse.game = game
  return true
}

/**
 * The CS2 Steam name to show. The name is saved on this PC and on the account; a fresh install (or another PC)
 * only has the account copy, so the box was empty although the account had a name.
 */
export function cs2SteamNameToShow(local: string | null | undefined, account: string | null | undefined): string {
  return local?.trim() || account?.trim() || ''
}

/** Account pane hint for CS2: never point to the web when the row has its own Link FACEIT button. */
export function cs2AccountHint(faceitNickname: string | null, steamName: string): string {
  if (faceitNickname) return `FACEIT: ${faceitNickname}`
  if (steamName) return `Steam: ${steamName}`
  return 'Add your Steam name or link FACEIT under Game accounts'
}
