/**
 * trainer-payload.ts
 * Pure helpers for the aim-trainer IPC: renderer launch request → DrillConfig, result → API payload,
 * and the correlation insights response. No Electron imports (unit-tested).
 */
import type { AppSettings } from './settings-manager'
import type { DrillConfig, SessionResult, TrainerLaunchInfo } from './trainer-bridge'
import { crosshairSettingsToGodot, trainerMouseToGodot } from './trainer-settings'

/**
 * Session sync payload for POST /api/training/sessions. `launch` is the launch this result belongs to
 * (from the bridge), so a late result never picks up the next drill's user_drill_id.
 */
export function buildTrainingSessionPayload(
  result: SessionResult,
  launch: Pick<TrainerLaunchInfo, 'difficulty' | 'user_drill_id'> | null,
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

  return {
    ...core,
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
  }
}

/**
 * Renderer launch request → DrillConfig. Mouse and crosshair settings always come from the saved
 * settings in main (source of truth), so any renderer-sent copies are ignored.
 */
export function drillConfigFromRequest(
  req: Record<string, unknown>,
  settings: Pick<AppSettings, 'trainerMouse' | 'crosshairSettings'>,
): DrillConfig {
  const duration = typeof req.duration_seconds === 'number' ? req.duration_seconds
    : typeof req.duration === 'number' ? req.duration : 60
  const difficulty = ['easy', 'medium', 'hard', 'pro'].includes(req.difficulty as string)
    ? req.difficulty as DrillConfig['difficulty'] : 'medium'
  const userDrillId = typeof req.user_drill_id === 'number' && Number.isInteger(req.user_drill_id) && req.user_drill_id > 0
    ? req.user_drill_id : undefined
  return {
    scenario: String(req.scenario ?? 'flick') as DrillConfig['scenario'],
    duration_seconds: duration,
    difficulty,
    ...(typeof req.target_size_override === 'number' ? { target_size_override: req.target_size_override } : {}),
    ...(req.context && typeof req.context === 'object' ? { context: req.context as DrillConfig['context'] } : {}),
    ...(userDrillId ? { user_drill_id: userDrillId } : {}),
    mouse_settings: trainerMouseToGodot(settings.trainerMouse),
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
