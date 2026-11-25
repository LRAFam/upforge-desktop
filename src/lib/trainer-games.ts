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

/**
 * What Practice › Setup shows: game, sensitivity, mouse DPI, eDPI (DPI × sensitivity) and FOV, the same values
 * as Settings › Trainer. The trainer reads mouse movement directly and never uses DPI; DPI is shown because it
 * sets your effective speed (eDPI) in the game and the trainer alike.
 */
export function trainerAimFacts(mouse: { game?: unknown; sensitivity?: unknown; fov?: unknown; dpi?: unknown } | null | undefined): Array<{ label: string; value: string }> {
  if (!mouse || !isTrainerGame(mouse.game)) return []
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
  const facts = [{ label: 'Game', value: TRAINER_GAME_LABELS[mouse.game] }]
  if (num(mouse.sensitivity)) facts.push({ label: 'Sensitivity', value: String(mouse.sensitivity) })
  if (num(mouse.dpi) && mouse.dpi > 0) {
    facts.push({ label: 'Mouse DPI', value: String(Math.round(mouse.dpi)) })
    if (num(mouse.sensitivity)) facts.push({ label: 'eDPI', value: String(Math.round(mouse.dpi * mouse.sensitivity)) })
  }
  if (num(mouse.fov)) facts.push({ label: 'FOV', value: `${mouse.fov}°` })
  return facts
}

/** One line under the Setup facts: what eDPI is and how a change moves it. */
export const EDPI_NOTE = 'eDPI = mouse DPI × sensitivity, your effective speed. Raising either one raises eDPI. The trainer reads your mouse directly, so it feels the same as the game at any DPI.'

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
