/**
 * trainer-payload.ts
 * Pure helpers for the aim-trainer IPC: renderer launch request → DrillConfig, result → API payload,
 * and the correlation insights response. No Electron imports (unit-tested).
 */
import { personalDistanceConfig } from '../../src/lib/personal-training-distance'
import type { AppSettings } from './settings-manager'
import type { DrillConfig, SessionResult, TrainerLaunchInfo } from './trainer-bridge'
import { crosshairSettingsToGodot, targetPaletteToGodot, trainerMouseToGodot } from './trainer-settings'
import { TRAINER_VERSION, TRAINER_PERSONAL_DISTANCE_CAPABILITY } from './trainer-version'
import { LAUNCHABLE_SCENARIO_KEYS } from '../../src/lib/trainer-scenarios'
import { trainerStaysOpen } from '../../src/lib/trainer-display'

/** Which app and bundled trainer produced a run (stored in metadata so support can tell builds apart). */
export interface RunVersions {
  app_version: string
  trainer_version: string
}

/**
 * Session sync payload for POST /api/training/sessions. `launch` is the launch this result belongs to
 * (from the bridge), so a late result never picks up the next drill's user_drill_id.
 */
export function buildTrainingSessionPayload(
  result: SessionResult,
  launch: Pick<TrainerLaunchInfo, 'difficulty' | 'user_drill_id'> | null,
  versions?: RunVersions,
): Record<string, unknown> {
  const {
    max_streak,
    min_reaction_ms,
    max_reaction_ms,
    targets_per_minute,
    metadata: scenarioMetadata,
    ...core
  } = result
  const metadata: Record<string, unknown> = { ...scenarioMetadata }
  if (max_streak != null) metadata.max_streak = max_streak
  if (min_reaction_ms != null) metadata.min_reaction_ms = min_reaction_ms
  if (max_reaction_ms != null) metadata.max_reaction_ms = max_reaction_ms
  if (targets_per_minute != null) metadata.targets_per_minute = targets_per_minute
  if (metadata.scoring_version == null && launch?.difficulty) metadata.difficulty = launch.difficulty // Legacy trainer compatibility only; these runs are excluded from current comparisons.
  if (launch?.user_drill_id) metadata.user_drill_id = launch.user_drill_id
  else delete metadata.user_drill_id
  if (versions) {
    metadata.app_version = versions.app_version
    metadata.trainer_version = versions.trainer_version
  }

  return {
    ...core,
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
  }
}

/**
 * The trainer does not report which game's settings it ran with; stamp the launch's game so scores
 * are only compared with runs on the same game (see trainingComparisonModel). Returns a copy.
 */
export function withLaunchGame(result: SessionResult, config: Pick<DrillConfig, 'mouse_settings'> | null | undefined): SessionResult {
  const game = config?.mouse_settings?.game
  if (typeof result.metadata?.game === 'string' || typeof game !== 'string' || game === '') return result
  return { ...result, metadata: { ...result.metadata, game } }
}

/**
 * Renderer launch request → DrillConfig. Mouse and crosshair settings always come from the saved
 * settings in main (source of truth), so any renderer-sent copies are ignored. `lesson: true` ("Show the
 * lesson") is passed on; anything else is left out so the trainer shows a lesson the first time only.
 * `trainerVersion` is the trainer build the drill runs on (the bundled one): it decides which keys it reads.
 * `keepOpen`: the trainer stays open on its end card after the result (only a trainer that reads it gets
 * `keep_open`); the request's `next_scenario` (a guided session's next step) rides along only then.
 */
export function drillConfigFromRequest(
  req: Record<string, unknown>,
  settings: Pick<AppSettings, 'trainerMouse' | 'crosshairSettings'>,
  trainerVersion: string = TRAINER_VERSION,
  opts: { keepOpen?: boolean; personalDistanceCapability?: 'v1' } = {},
): DrillConfig {
  const duration = typeof req.duration_seconds === 'number' ? req.duration_seconds
    : typeof req.duration === 'number' ? req.duration : 60
  const difficulty = ['easy', 'medium', 'hard', 'pro'].includes(req.difficulty as string)
    ? req.difficulty as DrillConfig['difficulty'] : 'medium'
  const userDrillId = typeof req.user_drill_id === 'number' && Number.isInteger(req.user_drill_id) && req.user_drill_id > 0
    ? req.user_drill_id : undefined
  const mouseSettings = trainerMouseToGodot(settings.trainerMouse)
  const distanceConfig = personalDistanceConfig(req.scenario, mouseSettings.game, req.distances_m)
  if (distanceConfig.distances_m && (opts.personalDistanceCapability ?? TRAINER_PERSONAL_DISTANCE_CAPABILITY) !== 'v1') {
    throw new Error('distances_m requires a verified trainer build with personalized distance support. Update UpForge before starting this drill.')
  }
  const keepOpen = opts.keepOpen === true && trainerStaysOpen(trainerVersion)
  const next = keepOpen && typeof req.next_scenario === 'string' && (LAUNCHABLE_SCENARIO_KEYS as readonly string[]).includes(req.next_scenario)
    ? req.next_scenario as DrillConfig['scenario'] : undefined
  return {
    scenario: String(req.scenario ?? 'flick') as DrillConfig['scenario'],
    duration_seconds: duration,
    difficulty,
    ...(typeof req.target_size_override === 'number' ? { target_size_override: req.target_size_override } : {}),
    ...(req.context && typeof req.context === 'object' ? { context: req.context as DrillConfig['context'] } : {}),
    ...(userDrillId ? { user_drill_id: userDrillId } : {}),
    ...(req.lesson === true ? { lesson: true } : {}),
    ...(keepOpen ? { keep_open: true } : {}),
    ...(next ? { next_scenario: next } : {}),
    ...targetPaletteToGodot(settings.trainerMouse, trainerVersion),
    ...distanceConfig,
    mouse_settings: mouseSettings,
    crosshair_settings: crosshairSettingsToGodot(settings.crosshairSettings),
  }
}

/** GET /api/training/correlation returns `{ insights: string[] }` (tolerate a bare array too). */
export function correlationInsightsFrom(data: unknown): string[] {
  const list = Array.isArray(data) ? data
    : data && typeof data === 'object' && Array.isArray((data as { insights?: unknown }).insights) ? (data as { insights: unknown[] }).insights
    : []
  return list.filter((x): x is string => typeof x === 'string')
}

/** Games GET /api/drills and /api/training/plan accept as `?game=` (API validates the same list). */
const DRILL_GAMES = ['valorant', 'cs2', 'deadlock', 'lol']

/** Axios config for `?game=`: only a known game key is sent; anything else asks for every game (older behaviour). */
export function drillGameParams(game: unknown): { params?: { game: string } } {
  return typeof game === 'string' && DRILL_GAMES.includes(game) ? { params: { game } } : {}
}

/** Header the API reads to plan only drills this build's trainer can launch (older builds send none). */
export const TRAINER_SCENARIOS_HEADER = 'X-Trainer-Scenarios'

/** Axios config for GET /api/training/plan, /api/drills and /api/drills/rulebook: `?game=` plus the launchable drill keys. */
export function drillReadConfig(game: unknown, capability = TRAINER_PERSONAL_DISTANCE_CAPABILITY): { params?: { game: string }, headers: Record<string, string> } {
  return { ...drillGameParams(game), headers: { [TRAINER_SCENARIOS_HEADER]: LAUNCHABLE_SCENARIO_KEYS.join(','), ...(capability === 'v1' ? { 'X-Trainer-Personal-Distance': 'v1' } : {}) } }
}
