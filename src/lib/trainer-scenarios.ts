/** Canonical UpForge aim trainer scenario registry (mirrors upforge-api/config/trainer-scenarios.php) */

export type TrainerScenarioKey =
  | 'flick'
  | 'gridshot'
  | 'sixshot'
  | 'microadjust'
  | 'microflick'
  | 'tracking'
  | 'strafe_track'
  | 'switching'
  | 'strafe_aim'
  | 'duel'

export type TrainerDifficulty = 'easy' | 'medium' | 'hard' | 'pro'
export type TrainerUiGroup = 'aim' | 'reaction' | 'precision' | 'duel'

export interface TrainerScenarioDef {
  key: TrainerScenarioKey
  label: string
  description: string
  tip: string
  uiGroup: TrainerUiGroup
  radar: boolean
  vodCategories: string[]
}

export const TRAINER_SCENARIOS: TrainerScenarioDef[] = [
  {
    key: 'flick',
    label: 'Flick',
    description: 'React and snap to stationary targets.',
    tip: 'Keep your arm loose — flicks are shoulder, not wrist.',
    uiGroup: 'aim',
    radar: true,
    vodCategories: ['mechanics', 'crosshair_placement'],
  },
  {
    key: 'gridshot',
    label: 'Gridshot',
    description: 'Six targets on screen — click any to respawn. Pure clicking speed.',
    tip: 'Eyes lead — find the next target before your click lands.',
    uiGroup: 'aim',
    radar: false,
    vodCategories: ['mechanics'],
  },
  {
    key: 'sixshot',
    label: 'Sixshot',
    description: 'Six clustered targets in a tight zone. Burst speed and rhythm.',
    tip: 'Stay relaxed between bursts — tension kills rhythm.',
    uiGroup: 'aim',
    radar: false,
    vodCategories: ['mechanics'],
  },
  {
    key: 'microadjust',
    label: 'Micro-Adj',
    description: 'Fine corrections from near your cursor.',
    tip: 'Slow your mousepad movement — this is fingertip control.',
    uiGroup: 'precision',
    radar: true,
    vodCategories: ['crosshair_placement', 'mechanics'],
  },
  {
    key: 'microflick',
    label: 'Micro Flick',
    description: 'Tiny targets with a short window. Limits of flick precision.',
    tip: 'Micro-corrections only — no full arm flicks.',
    uiGroup: 'precision',
    radar: false,
    vodCategories: ['crosshair_placement'],
  },
  {
    key: 'tracking',
    label: 'Tracking',
    description: 'Keep crosshair on a moving target.',
    tip: "Match the target speed — don't overshoot then correct.",
    uiGroup: 'reaction',
    radar: true,
    vodCategories: ['mechanics', 'positioning'],
  },
  {
    key: 'strafe_track',
    label: 'Strafe Track',
    description: 'Target strafes back and forth — hold and track.',
    tip: 'Mirror their movement with smooth horizontal input.',
    uiGroup: 'reaction',
    radar: false,
    vodCategories: ['mechanics'],
  },
  {
    key: 'switching',
    label: 'Switch',
    description: 'Click highlighted targets across the screen.',
    tip: 'Move your eyes before your mouse — predict, don\'t react.',
    uiGroup: 'reaction',
    radar: true,
    vodCategories: ['game_sense', 'positioning'],
  },
  {
    key: 'strafe_aim',
    label: 'Strafe Aim',
    description: 'Counter-strafe before each shot. Stop-and-shoot muscle memory.',
    tip: 'Release A/D before clicking — full stop first.',
    uiGroup: 'duel',
    radar: false,
    vodCategories: ['positioning', 'mechanics'],
  },
  {
    key: 'duel',
    label: '3D Duel',
    description: 'FPS arena — peek angles, WASD movement.',
    tip: 'Pre-aim corners before committing — don\'t wide-peek.',
    uiGroup: 'duel',
    radar: true,
    vodCategories: ['mechanics', 'crosshair_placement'],
  },
]

export const TRAINER_SCENARIO_KEYS = TRAINER_SCENARIOS.map(s => s.key)

export const RADAR_SCENARIO_KEYS = TRAINER_SCENARIOS.filter(s => s.radar).map(s => s.key)

const scenarioByKey = Object.fromEntries(TRAINER_SCENARIOS.map(s => [s.key, s])) as Record<
  TrainerScenarioKey,
  TrainerScenarioDef
>

/** VOD coaching category → default trainer scenario */
export const CATEGORY_TO_TRAINER_SCENARIO: Record<string, TrainerScenarioKey> = {
  mechanics: 'flick',
  crosshair_placement: 'microadjust',
  game_sense: 'switching',
  positioning: 'strafe_aim',
  utility_usage: 'flick',
  economy: 'flick',
  communication: 'flick',
}

export function trainerScenarioDef(key: string): TrainerScenarioDef | undefined {
  return scenarioByKey[key as TrainerScenarioKey]
}

export function resolveTrainerScenario(input: {
  trainer_scenario?: string | null
  godot_config?: { scenario?: string } | null
  category?: string | null
}): TrainerScenarioKey {
  const fromField = input.trainer_scenario ?? input.godot_config?.scenario
  if (fromField && fromField in scenarioByKey) {
    return fromField as TrainerScenarioKey
  }
  if (input.category && CATEGORY_TO_TRAINER_SCENARIO[input.category]) {
    return CATEGORY_TO_TRAINER_SCENARIO[input.category]
  }
  return 'flick'
}

export function resolveTrainerDifficulty(
  drill: { trainer_difficulty?: string | null; baseline_score?: number; godot_config?: { difficulty?: string } | null },
  fallback: TrainerDifficulty = 'medium',
): TrainerDifficulty {
  const d = drill.trainer_difficulty ?? drill.godot_config?.difficulty
  if (d === 'easy' || d === 'medium' || d === 'hard' || d === 'pro') return d
  const baseline = drill.baseline_score ?? 5
  if (baseline >= 9) return 'pro'
  if (baseline >= 7) return 'hard'
  if (baseline >= 4) return 'medium'
  return fallback
}

export function resolveTrainerDuration(
  drill: { trainer_duration_seconds?: number | null; godot_config?: { duration_seconds?: number } | null },
  fallback = 60,
): number {
  const d = drill.trainer_duration_seconds ?? drill.godot_config?.duration_seconds
  if (typeof d === 'number' && d >= 30 && d <= 300) return d
  return fallback
}

/** Godot session extras → API metadata payload */
export function buildSessionMetadata(
  result: {
    max_streak?: number
    min_reaction_ms?: number
    max_reaction_ms?: number
    targets_per_minute?: number
  },
  launch?: { difficulty?: TrainerDifficulty; user_drill_id?: number } | null,
): Record<string, unknown> {
  const meta: Record<string, unknown> = {}
  if (result.max_streak != null) meta.max_streak = result.max_streak
  if (result.min_reaction_ms != null) meta.min_reaction_ms = result.min_reaction_ms
  if (result.max_reaction_ms != null) meta.max_reaction_ms = result.max_reaction_ms
  if (result.targets_per_minute != null) meta.targets_per_minute = result.targets_per_minute
  if (launch?.difficulty) meta.difficulty = launch.difficulty
  if (launch?.user_drill_id) meta.user_drill_id = launch.user_drill_id
  return meta
}

export const EXTENDED_SCENARIO_KEYS = TRAINER_SCENARIOS.filter(s => !s.radar).map(s => s.key)
