/** UpForge aim trainer drills: the API manifest (trainer-scenarios.manifest.json) plus desktop copy. */
import trainerManifest from './trainer-scenarios.manifest.json'

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
  /** Retired drill: kept for history and saved runs, never offered in a drill picker. */
  retired?: boolean
}

/** One row of GET /api/training/scenarios (API resources/trainer-scenarios.json). */
export interface TrainerManifestScenario {
  key: string
  label: string
  ui_group: string
  categories: string[]
  radar: boolean
  beta: boolean
  games: string[] | null
  /** Only present (true) on retired drills. */
  retired?: boolean
}

/**
 * Bundled copy of the API drill list. Keys, labels, groups, radar, beta and games come only from here;
 * refresh it with `npm run drills:sync` (trainer-scenarios.test.ts fails when it and DRILL_COPY drift).
 */
export const TRAINER_MANIFEST = trainerManifest as { version: number; games: string[]; difficulties: string[]; scenarios: TrainerManifestScenario[] }

/** Desktop-only words per drill. Everything else comes from the manifest. */
export const DRILL_COPY: Record<TrainerScenarioKey, { description: string; tip: string }> = {
  angle_clearing: {
    description: 'Clear cover before taking a headshot.',
    tip: 'Move sideways until the head clears cover, then click.',
  },
  distance_switching: {
    description: 'Alternate between close and distant standing targets.',
    tip: 'Keep your crosshair level while switching between near and far heads.',
  },
  head_height: {
    description: 'Clear corners against standing targets at 10m and 20m. Footage-based prototype.',
    tip: 'Use A/D to clear each bay with your crosshair at head height.',
  },
  flick: {
    description: 'React and snap to stationary targets.',
    tip: 'Keep your arm loose — flicks are shoulder, not wrist.',
  },
  gridshot: {
    description: 'Six targets on screen — click any to respawn. Pure clicking speed.',
    tip: 'Eyes lead — find the next target before your click lands.',
  },
  sixshot: {
    description: 'Six clustered targets in a tight zone. Burst speed and rhythm.',
    tip: 'Stay relaxed between bursts — tension kills rhythm.',
  },
  microadjust: {
    description: 'Fine corrections from near your cursor.',
    tip: 'Slow your mousepad movement — this is fingertip control.',
  },
  microflick: {
    description: 'Tiny targets with a short window. Limits of flick precision.',
    tip: 'Micro-corrections only — no full arm flicks.',
  },
  tracking: {
    description: 'Keep crosshair on a moving target.',
    tip: "Match the target speed — don't overshoot then correct.",
  },
  strafe_track: {
    description: 'Target strafes back and forth — hold and track.',
    tip: 'Mirror their movement with smooth horizontal input.',
  },
  switching: {
    description: 'Click highlighted targets across the screen.',
    tip: 'Move your eyes before your mouse — predict, don\'t react.',
  },
  strafe_aim: {
    description: 'Counter-strafe before each shot. Stop-and-shoot muscle memory.',
    tip: 'Release A/D before clicking — full stop first.',
  },
  duel: {
    description: 'FPS arena — peek angles, WASD movement.',
    tip: 'Pre-aim corners before committing — don\'t wide-peek.',
  },
  hold_angle: {
    description: 'Hold a doorway while an enemy swings at a random moment. Never shoot at nothing.',
    tip: 'Park your crosshair at head height on the edge and wait for the swing.',
  },
  jiggle_peek: {
    description: 'Peek just long enough to spot the enemy, then get back to cover.',
    tip: 'Tap out, see them, and leave before they can react.',
  },
  trade_window: {
    description: 'Your teammate dies on an angle. Swing and trade before the enemy resets.',
    tip: 'Stay a few metres behind and swing the moment they drop.',
  },
  clear_site: {
    description: 'Glide through a site and pre-aim each corner before it opens.',
    tip: 'Crosshair on the next corner at head height before you reach it.',
  },
  flash_swing: {
    description: 'An enemy flash comes over the wall. Turn away in time, then win the swing.',
    tip: 'Turn your back on the flash before it pops, then snap back to the angle.',
  },
  operator_hold: {
    description: 'Hold a long angle scoped while enemies wide-swing. Missing costs you the bolt.',
    tip: 'Stay scoped on the swing line and take the first clean shot.',
  },
  defuse_decision: {
    description: 'The spike is down. Clear the hidden enemy or stick the defuse in time.',
    tip: 'Bait with a tap or check the angle first; past 3.5 s you keep half.',
  },
  retake_crossfire: {
    description: 'Two defenders hold the site. Take the fights one at a time.',
    tip: 'Find the path where only one of them can see you.',
  },
}

export const TRAINER_SCENARIOS: TrainerScenarioDef[] = TRAINER_MANIFEST.scenarios
  .filter(s => s.key in DRILL_COPY)
  .map(s => ({
    key: s.key as TrainerScenarioKey,
    label: s.label,
    ...DRILL_COPY[s.key as TrainerScenarioKey],
    uiGroup: s.ui_group as TrainerUiGroup,
    radar: s.radar,
    vodCategories: s.categories,
    ...(s.beta ? { beta: true } : {}),
    ...(s.games ? { games: s.games } : {}),
    ...(s.retired ? { retired: true } : {}),
  }))

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

/** Drill picker list for a primary game (no retired drills). Results/history still look drills up by key regardless of game. */
export function trainerScenariosForGame(game: string | null | undefined): TrainerScenarioDef[] {
  return TRAINER_SCENARIOS.filter(def => !def.retired && isScenarioForGame(def.key, game))
}

/**
 * Every drill key this build's trainer can launch (retired ones included). Sent to the API as the
 * X-Trainer-Scenarios header so plans, drill lists and the rulebook never name a drill this build lacks.
 */
export const LAUNCHABLE_SCENARIO_KEYS: readonly TrainerScenarioKey[] = Object.keys(DRILL_COPY) as TrainerScenarioKey[]

const scenarioByKey = Object.fromEntries(TRAINER_SCENARIOS.map(s => [s.key, s])) as Record<
  TrainerScenarioKey,
  TrainerScenarioDef
>

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
 * Order: the coach's `trainer_scenario` → (not for utility/economy/comms) the API's `godot_config.scenario`
 * → null. The client never guesses a drill from the category: the API's assignment gate decides.
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
  return validScenario(input.godot_config?.scenario)
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

/** The drill's display name ("Flick Shot"), never its internal id; unknown ids are title-cased. */
export function drillDisplayName(key: string | null | undefined): string {
  if (!key) return 'Drill'
  return trainerScenarioDef(key)?.label ?? key.split(/[_-]+/).filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}
