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
  | 'angle_clearing'
  | 'distance_switching'
  | 'head_height'
  | 'strafe_aim'
  | 'duel'
  | 'hold_angle'
  | 'jiggle_peek'
  | 'trade_window'
  | 'clear_site'
  | 'flash_swing'
  | 'operator_hold'
  | 'defuse_decision'
  | 'retake_crossfire'

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
  /** Beta drill: launchable by hand, never auto-picked by coaching or added to the radar. */
  beta?: boolean
  /** Primary games this drill is for (omitted = every game). Hidden from drill pickers for other games. */
  games?: string[]
}

export const TRAINER_SCENARIOS: TrainerScenarioDef[] = [
  {
    key: 'angle_clearing',
    label: 'Angle Clearing',
    description: 'Clear cover before taking a headshot.',
    tip: 'Move sideways until the head clears cover, then click.',
    uiGroup: 'duel',
    radar: false,
    vodCategories: ['crosshair_placement'],
  },
  {
    key: 'distance_switching',
    label: 'Distance Switching',
    description: 'Alternate between close and distant standing targets.',
    tip: 'Keep your crosshair level while switching between near and far heads.',
    uiGroup: 'duel',
    radar: false,
    vodCategories: ['crosshair_placement'],
  },
  {
    key: 'head_height',
    label: 'Head Height Corridor',
    description: 'Clear corners against standing targets at 10m and 20m. Footage-based prototype.',
    tip: 'Use A/D to clear each bay with your crosshair at head height.',
    uiGroup: 'duel',
    radar: false,
    vodCategories: ['crosshair_placement'],
  },
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
  {
    key: 'hold_angle',
    label: 'Hold the Angle',
    description: 'Hold a doorway while an enemy swings at a random moment. Never shoot at nothing.',
    tip: 'Park your crosshair at head height on the edge and wait for the swing.',
    uiGroup: 'duel',
    radar: false,
    vodCategories: ['crosshair_placement', 'positioning'],
    beta: true,
  },
  {
    key: 'jiggle_peek',
    label: 'Jiggle Peek',
    description: 'Peek just long enough to spot the enemy, then get back to cover.',
    tip: 'Tap out, see them, and leave before they can react.',
    uiGroup: 'duel',
    radar: false,
    vodCategories: ['positioning'],
    beta: true,
  },
  {
    key: 'trade_window',
    label: 'Trade Window',
    description: 'Your teammate dies on an angle. Swing and trade before the enemy resets.',
    tip: 'Stay a few metres behind and swing the moment they drop.',
    uiGroup: 'duel',
    radar: false,
    vodCategories: ['positioning'],
    beta: true,
  },
  {
    key: 'clear_site',
    label: 'Clear the Site',
    description: 'Glide through a site and pre-aim each corner before it opens.',
    tip: 'Crosshair on the next corner at head height before you reach it.',
    uiGroup: 'duel',
    radar: false,
    vodCategories: ['crosshair_placement'],
    beta: true,
  },
  {
    key: 'flash_swing',
    label: 'Flash & Swing',
    description: 'An enemy flash comes over the wall. Turn away in time, then win the swing.',
    tip: 'Turn your back on the flash before it pops, then snap back to the angle.',
    uiGroup: 'duel',
    radar: false,
    vodCategories: ['crosshair_placement', 'utility_usage'],
    beta: true,
    games: ['valorant'],
  },
  {
    key: 'operator_hold',
    label: 'Operator Hold',
    description: 'Hold a long angle scoped while enemies wide-swing. Missing costs you the bolt.',
    tip: 'Stay scoped on the swing line and take the first clean shot.',
    uiGroup: 'duel',
    radar: false,
    vodCategories: ['mechanics', 'positioning'],
    beta: true,
    games: ['valorant'],
  },
  {
    key: 'defuse_decision',
    label: 'Defuse Decision',
    description: 'The spike is down. Clear the hidden enemy or stick the defuse in time.',
    tip: 'Bait with a tap or check the angle first; past 3.5 s you keep half.',
    uiGroup: 'duel',
    radar: false,
    vodCategories: ['game_sense'],
    beta: true,
    games: ['valorant'],
  },
  {
    key: 'retake_crossfire',
    label: 'Retake Crossfire',
    description: 'Two defenders hold the site. Take the fights one at a time.',
    tip: 'Find the path where only one of them can see you.',
    uiGroup: 'duel',
    radar: false,
    vodCategories: ['positioning', 'game_sense'],
    beta: true,
    games: ['valorant'],
  },
]

export const TRAINER_SCENARIO_KEYS = TRAINER_SCENARIOS.map(s => s.key)

export const RADAR_SCENARIO_KEYS = TRAINER_SCENARIOS.filter(s => s.radar && !s.beta).map(s => s.key)

export const BETA_SCENARIO_KEYS = TRAINER_SCENARIOS.filter(s => s.beta).map(s => s.key)

export function isBetaScenario(key: string | null | undefined): boolean {
  return !!key && !!scenarioByKey[key as TrainerScenarioKey]?.beta
}

/** True when the drill belongs in pickers for this primary game (drills without `games` suit every game). */
export function isScenarioForGame(key: string, game: string | null | undefined): boolean {
  const games = scenarioByKey[key as TrainerScenarioKey]?.games
  return !games || (!!game && games.includes(game))
}

/** Drill picker list for a primary game. Results/history still look drills up by key regardless of game. */
export function trainerScenariosForGame(game: string | null | undefined): TrainerScenarioDef[] {
  return TRAINER_SCENARIOS.filter(def => isScenarioForGame(def.key, game))
}

const scenarioByKey = Object.fromEntries(TRAINER_SCENARIOS.map(s => [s.key, s])) as Record<
  TrainerScenarioKey,
  TrainerScenarioDef
>

/**
 * VOD coaching category → default trainer scenario (mirrors upforge-api category_defaults).
 * Utility, economy and communication have no aim-trainer drill: those drills are practised in game.
 */
export const CATEGORY_TO_TRAINER_SCENARIO: Record<string, TrainerScenarioKey> = {
  mechanics: 'flick',
  crosshair_placement: 'head_height',
  game_sense: 'switching',
  positioning: 'duel',
}

/** Coaching categories the aim trainer cannot train (no trainer launch, no guided-session step). */
export const NON_TRAINER_CATEGORIES: readonly string[] = ['utility_usage', 'economy', 'communication']

export function isNonTrainerCategory(category: string | null | undefined): boolean {
  return !!category && NON_TRAINER_CATEGORIES.includes(category)
}

export function trainerScenarioDef(key: string): TrainerScenarioDef | undefined {
  return scenarioByKey[key as TrainerScenarioKey]
}

function validScenario(key: string | null | undefined): TrainerScenarioKey | null {
  return key && key in scenarioByKey ? (key as TrainerScenarioKey) : null
}

/**
 * Trainer scenario for a coaching drill, or null when the drill is not an aim-trainer drill.
 * Order: the coach's `trainer_scenario` → (not for utility/economy/comms) `godot_config.scenario`
 * → category default → null. Never falls back to Flick.
 */
export function resolveTrainerScenario(input: {
  trainer_scenario?: string | null
  godot_config?: { scenario?: string } | null
  category?: string | null
}): TrainerScenarioKey | null {
  const explicit = validScenario(input.trainer_scenario)
  if (explicit) return explicit
  // Older API responses filled godot_config.scenario from the category (utility → flick): a guess, not a drill.
  if (isNonTrainerCategory(input.category)) return null
  const fromConfig = validScenario(input.godot_config?.scenario)
  if (fromConfig) return fromConfig
  return (input.category && CATEGORY_TO_TRAINER_SCENARIO[input.category]) || null
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

// Session → API metadata lives in the main process (electron/main/trainer-payload.ts buildTrainingSessionPayload).

export const EXTENDED_SCENARIO_KEYS = TRAINER_SCENARIOS.filter(s => !s.radar).map(s => s.key)
