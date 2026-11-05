/**
 * One way to launch the Godot aim trainer from any screen, plus the helpers every launcher needs:
 * - always sends `duration_seconds` (never the old `duration`)
 * - treats `{ ok: false }` (missing binary, could not connect) as a failure with a friendly message
 * - `user_drill_id` only when the run counts towards an assigned/user drill (never for free play)
 * Mouse and crosshair settings are added by the main process from saved settings.
 */
import type { TrainerLaunchInfo, TrainerSessionEnded } from '../env'
import type { LaunchConfig } from '../stores/trainerResult'

export interface TrainerLaunchRequest {
  scenario: string
  duration_seconds?: number
  difficulty?: string
  context?: Record<string, unknown>
  user_drill_id?: number | null
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
  if (req.context) config.context = JSON.parse(JSON.stringify(req.context)) as Record<string, unknown>
  if (typeof req.user_drill_id === 'number' && Number.isInteger(req.user_drill_id) && req.user_drill_id > 0) {
    config.user_drill_id = req.user_drill_id
  }
  return config
}

export const TRAINER_LAUNCH_FAILED_MESSAGE = 'The aim trainer did not start. Try again, or restart UpForge.'

export async function launchTrainer(req: TrainerLaunchRequest): Promise<TrainerLaunchOutcome> {
  const config = trainerLaunchConfig(req)
  try {
    const res = await window.api.trainer.launch({ ...config })
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
  })
}

export function asSessionEnded(raw: unknown): TrainerSessionEnded | null {
  if (!raw || typeof raw !== 'object') return null
  const e = raw as Partial<TrainerSessionEnded>
  return typeof e.reason === 'string' ? (e as TrainerSessionEnded) : null
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
      return 'The trainer couldn’t read this drill’s settings. Try again, or pick another drill.'
    case 'crashed':
      return 'The aim trainer closed before the drill finished. Nothing was saved — try again.'
    case 'error':
    default:
      return 'Something went wrong in the aim trainer. Nothing was saved — try again.'
  }
}
