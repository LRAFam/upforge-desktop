/**
 * One way to launch the Godot aim trainer from any screen, plus the helpers every launcher needs:
 * - always sends `duration_seconds` (never the old `duration`)
 * - treats `{ ok: false }` (missing binary, could not connect) as a failure with a friendly message
 * - `user_drill_id` only when the run counts towards an assigned/user drill (never for free play)
 * Mouse and crosshair settings are added by the main process from saved settings.
 */
import type { TrainerLaunchInfo, TrainerNextDrillRequest, TrainerSessionEnded } from '../env'
import type { LaunchConfig } from '../stores/trainerResult'

export interface TrainerLaunchRequest {
  distances_m?: [number, number]
  scenario: string
  duration_seconds?: number
  difficulty?: string
  context?: Record<string, unknown>
  user_drill_id?: number | null
  /** Run the drill's guided lesson first even when this PC has seen it (sent as `lesson: true`, this launch only). */
  lesson?: boolean
  /**
   * The drill the trainer's end card offers next (N), this launch only: a guided session's next step. Main sends it
   * only to a trainer that stays open between runs.
   */
  next_scenario?: string
}

/**
 * Drills with a guided lesson in the bundled trainer (upforge-trainer `_has_lesson()` at the tag in
 * trainer-version.json). Elsewhere `lesson: true` does nothing, so "Show the lesson" is not offered there.
 */
const DRILLS_WITH_LESSON: ReadonlySet<string> = new Set(['head_height', 'angle_clearing', 'hold_angle', 'jiggle_peek', 'strafe_aim'])

export function drillHasLesson(scenario: string): boolean {
  return DRILLS_WITH_LESSON.has(scenario)
}

export interface TrainerLaunchOutcome {
  ok: boolean
  error?: string
  launchId?: number
  config: LaunchConfig
}

export const DEFAULT_TRAINER_DURATION = 60

/** Plain (non-reactive) launch config; safe for IPC structured clone. */
export function trainerLaunchConfig(req: TrainerLaunchRequest): LaunchConfig {
  const duration = typeof req.duration_seconds === 'number' && Number.isFinite(req.duration_seconds) && req.duration_seconds > 0
    ? Math.round(req.duration_seconds) : DEFAULT_TRAINER_DURATION
  const config: LaunchConfig = {
    scenario: req.scenario,
    duration_seconds: duration,
    difficulty: req.difficulty ?? 'medium',
  }
  if (req.distances_m !== undefined) config.distances_m = [...req.distances_m]
  if (req.context) config.context = JSON.parse(JSON.stringify(req.context)) as Record<string, unknown>
  if (typeof req.user_drill_id === 'number' && Number.isInteger(req.user_drill_id) && req.user_drill_id > 0) {
    config.user_drill_id = req.user_drill_id
  }
  return config
}

export const TRAINER_LAUNCH_FAILED_MESSAGE = 'The aim trainer did not start. Try again, or restart UpForge.'

/** The returned `config` never asks for the lesson or names a next drill, so "Play again" is a normal single run. */
export async function launchTrainer(req: TrainerLaunchRequest): Promise<TrainerLaunchOutcome> {
  const config = trainerLaunchConfig(req)
  try {
    const res = await window.api.trainer.launch({
      ...config,
      ...(req.lesson === true ? { lesson: true } : {}),
      ...(typeof req.next_scenario === 'string' && req.next_scenario ? { next_scenario: req.next_scenario } : {}),
    })
    if (res?.ok) return { ok: true, launchId: res.launchId, config }
    return { ok: false, error: res?.error || TRAINER_LAUNCH_FAILED_MESSAGE, config }
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || TRAINER_LAUNCH_FAILED_MESSAGE, config }
  }
}

/** Launch info the main process sends with each result → the store's LaunchConfig (for "Play again"). */
export function launchConfigFromInfo(info: unknown): LaunchConfig | null {
  if (!info || typeof info !== 'object') return null
  const i = info as Partial<TrainerLaunchInfo>
  if (typeof i.scenario !== 'string' || typeof i.duration_seconds !== 'number') return null
  return trainerLaunchConfig({
    scenario: i.scenario,
    duration_seconds: i.duration_seconds,
    difficulty: typeof i.difficulty === 'string' ? i.difficulty : 'medium',
    context: i.context as Record<string, unknown> | undefined,
    user_drill_id: i.user_drill_id,
    ...(i.distances_m !== undefined ? { distances_m: [...i.distances_m] as [number, number] } : {}),
  })
}

/**
 * Practice (/training, guided sessions, calibration) and the results screen handle their own trainer
 * results. On any other screen (e.g. a drill started from Home) the app shell opens the results screen.
 */
export function shellOpensTrainerResult(path: string): boolean {
  if (path === '/training' || path.startsWith('/training/') || path === '/trainer-results') return false
  return !['/login', '/splash', '/overlay', '/onboarding'].includes(path) && !path.startsWith('/post-game')
}

/** A trainer result payload with the fields the results screen needs, or null. */
export function asTrainerResult(raw: unknown): import('../stores/trainerResult').SessionResult | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  return typeof r.scenario === 'string' && typeof r.score === 'number' && typeof r.completed_at === 'string'
    ? (raw as import('../stores/trainerResult').SessionResult)
    : null
}

/** The launch sent with a result or with `trainer:run-started`, or null. */
export function asLaunchInfo(raw: unknown): TrainerLaunchInfo | null {
  if (!raw || typeof raw !== 'object') return null
  const i = raw as Partial<TrainerLaunchInfo>
  return typeof i.launchId === 'number' && typeof i.scenario === 'string' ? (raw as TrainerLaunchInfo) : null
}

/** `trainer:next-drill` (N on the trainer's end card), or null. */
export function asNextDrillRequest(raw: unknown): TrainerNextDrillRequest | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Partial<TrainerNextDrillRequest>
  return typeof r.launchId === 'number' ? (raw as TrainerNextDrillRequest) : null
}

export function asSessionEnded(raw: unknown): TrainerSessionEnded | null {
  if (!raw || typeof raw !== 'object') return null
  const e = raw as Partial<TrainerSessionEnded>
  return typeof e.reason === 'string' ? (e as TrainerSessionEnded) : null
}

/** Names of the Settings › Trainer fields, by the trainer's `mouse_settings` key. */
const MOUSE_SETTING_NAMES: Record<string, string> = {
  sensitivity: 'in-game sensitivity', fov: 'horizontal FOV', dpi: 'mouse DPI', game: 'game',
  movement_speed: 'movement speed', trainer_volume: 'trainer volume', scoped_multiplier: 'scoped sensitivity multiplier',
}

/**
 * The trainer refuses a launch whose saved mouse or crosshair settings it cannot use ("mouse_settings.fov must
 * be from 1 to 179"). Every drill fails the same way, so the line names the setting and where to change it.
 */
function refusedSettingMessage(message: string | undefined): string | null {
  const mouse = /^mouse_settings\.(\w+)/.exec(message ?? '')
  if (mouse) {
    const name = MOUSE_SETTING_NAMES[mouse[1]] ?? 'mouse'
    return `The trainer can’t use your ${name} setting. Check it in Settings › Trainer, then try again.`
  }
  if (/^crosshair_settings\./.test(message ?? '')) {
    return 'The trainer can’t use your crosshair settings. Check them in Settings › Trainer, then try again.'
  }
  return null
}

/**
 * Short, friendly line for a drill that ended without a result, or null when nothing needs saying
 * (finished normally, the player quit on purpose, or a launch failure the launcher already reported).
 */
export function sessionEndedMessage(ended: Pick<TrainerSessionEnded, 'reason' | 'message'> | null): string | null {
  if (!ended) return null
  switch (ended.reason) {
    case 'completed':
    case 'user_exit':
    // launch_failed always comes with `{ ok: false }` from launch(), which the launcher already shows.
    case 'launch_failed':
      return null
    case 'unknown_scenario':
      return 'This drill isn’t in your trainer version yet. Update UpForge and try again.'
    case 'invalid_config':
      return refusedSettingMessage(ended.message) ?? 'The trainer couldn’t read this drill’s settings. Try again, or pick another drill.'
    case 'crashed':
      return 'The aim trainer closed before the drill finished. Nothing was saved — try again.'
    // The app closes the trainer when a game opens or a match starts (CS2 / Deadlock: the game client).
    case 'game_started':
      return 'Closed the trainer because your game opened. This drill was not saved.'
    case 'match_started':
      return 'Closed the trainer because your match started. This drill was not saved.'
    case 'error':
    default:
      return 'Something went wrong in the aim trainer. Nothing was saved — try again.'
  }
}
