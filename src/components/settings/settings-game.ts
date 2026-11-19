/**
 * Settings follows the title-bar game (cross-game pass 2026-11-02). Pure helpers so they can be unit-tested.
 */
import type { PrimaryGame } from '../../lib/games'
import { isTrainerGame, switchTrainerGame, type TrainerAimByGame } from '../../lib/trainer-games'

interface GameFields {
  primaryGame?: string
  trainerMouse: { game: string; sensitivity: number; fov: number; perGame?: TrainerAimByGame }
}

/**
 * Mirror a title-bar game switch into the Settings copy. The switch already saved `primaryGame` and, for a game
 * the trainer has a scale for, moved the trainer to that game with its own sensitivity and FOV
 * (usePrimaryGame.setPrimaryGame). Without this the open Settings screen keeps showing the old game's blocks
 * (CS2 demo folder, Deadlock diagnostics) and the old game's sensitivity, and its next save writes them back.
 * League has no trainer scale: the trainer stays on its game. Returns true when something changed.
 */
export function followSelectedGame(settings: GameFields, game: PrimaryGame): boolean {
  if (settings.primaryGame === game) return false
  settings.primaryGame = game
  if (isTrainerGame(game)) Object.assign(settings.trainerMouse, switchTrainerGame(settings.trainerMouse, game))
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
