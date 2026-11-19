/**
 * Games the aim trainer has a sensitivity scale for, and the sensitivity and FOV kept for each of them.
 * Shared by Settings › Trainer (renderer) and the saved settings / launch message (main), so both move
 * between games the same way. No imports: the main process loads this file too.
 */

/**
 * Degrees the camera turns per mouse count at sensitivity 1, as the trainer uses them
 * (upforge-trainer scripts/MouseSensitivity.gd at the tag in trainer-version.json).
 */
export const TRAINER_GAME_YAW = {
  valorant: 0.07,
  cs2: 0.022,
  deadlock: 0.044,
  apex: 0.022,
  overwatch2: 0.0066,
} as const

export type TrainerGame = keyof typeof TRAINER_GAME_YAW

export const TRAINER_GAMES = Object.keys(TRAINER_GAME_YAW) as TrainerGame[]

export const TRAINER_GAME_LABELS: Record<TrainerGame, string> = {
  valorant: 'Valorant',
  cs2: 'CS2',
  deadlock: 'Deadlock',
  apex: 'Apex Legends',
  overwatch2: 'Overwatch 2',
}

export function isTrainerGame(game: unknown): game is TrainerGame {
  return typeof game === 'string' && Object.prototype.hasOwnProperty.call(TRAINER_GAME_YAW, game)
}

/** Generic default FOV (Valorant's fixed 103° horizontal). */
export const DEFAULT_TRAINER_FOV = 103
/** CS2's own FOV value (the trainer reads CS2 fov as CS2's 4:3 value; CS2's default is 90). */
export const CS2_DEFAULT_FOV = 90

export function defaultTrainerFov(game: string | null | undefined): number {
  return game === 'cs2' ? CS2_DEFAULT_FOV : DEFAULT_TRAINER_FOV
}

/** A sensitivity in another game's numbers that turns the camera the same distance per mouse movement. */
export function convertTrainerSensitivity(sensitivity: number, from: TrainerGame, to: TrainerGame): number {
  return Math.round((sensitivity * TRAINER_GAME_YAW[from]) / TRAINER_GAME_YAW[to] * 1000) / 1000
}

/** What Practice › Setup shows: the game, sensitivity and FOV the trainer launches with (it never reads DPI). */
export function trainerAimFacts(mouse: { game?: unknown; sensitivity?: unknown; fov?: unknown } | null | undefined): Array<{ label: string; value: string }> {
  if (!mouse || !isTrainerGame(mouse.game)) return []
  const facts = [{ label: 'Game', value: TRAINER_GAME_LABELS[mouse.game] }]
  if (typeof mouse.sensitivity === 'number' && Number.isFinite(mouse.sensitivity)) facts.push({ label: 'Sensitivity', value: String(mouse.sensitivity) })
  if (typeof mouse.fov === 'number' && Number.isFinite(mouse.fov)) facts.push({ label: 'FOV', value: String(mouse.fov) })
  return facts
}

export interface TrainerGameAim {
  sensitivity: number
  fov: number
}

export type TrainerAimByGame = Partial<Record<TrainerGame, TrainerGameAim>>

interface MouseAim {
  game: string
  sensitivity: number
  fov: number
  perGame?: TrainerAimByGame
}

/**
 * The trainer moves to `game`. The current game keeps its sensitivity and FOV in `perGame`, and the new game
 * gets the ones it had last time. A game never set before gets the current sensitivity converted to its scale
 * (the same distance per mouse movement) and its default FOV, never the old number on a new scale.
 * Returns a plain copy (safe to send over IPC even when `mouse` is a reactive Settings copy).
 */
export function switchTrainerGame<T extends MouseAim>(mouse: T, game: TrainerGame): T {
  if (mouse.game === game) return { ...mouse }
  const from: TrainerGame = isTrainerGame(mouse.game) ? mouse.game : 'valorant'
  const perGame: TrainerAimByGame = {}
  for (const known of TRAINER_GAMES) {
    const aim = mouse.perGame?.[known]
    if (aim) perGame[known] = { sensitivity: aim.sensitivity, fov: aim.fov }
  }
  perGame[from] = { sensitivity: mouse.sensitivity, fov: mouse.fov }
  const next = perGame[game] ?? {
    sensitivity: convertTrainerSensitivity(mouse.sensitivity, from, game),
    fov: defaultTrainerFov(game),
  }
  return { ...mouse, game, sensitivity: next.sensitivity, fov: next.fov, perGame }
}
