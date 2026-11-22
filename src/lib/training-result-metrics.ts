import trainerPin from '../../trainer-version.json'

export interface ComparableTrainingRun {
  scenario: string
  duration_seconds: number
  completed_at: string
  metadata?: Record<string, unknown>
}
export interface TrainingComparisonRequest {
  scenario: string
  duration_seconds: number
  difficulty: string
  scoring_version: number
  before: string
  /** Same game + movement model only (API ≥ Nov 2026). Omitted = no model filter (older callers). */
  comparison_model?: string
}

/**
 * Scoring versions: each names the rules a score was made under, and a run is only compared with runs of the
 * same drill on the same version (the API's TrainingComparison holds the same table):
 *   2  trainer 1.11 and older: legacy, never compared
 *   3  trainer 1.12
 *   4  trainer 1.13.0, every drill (it stamped 3; its runs carry metadata.window), and later trainers on the
 *      drills whose rules have not changed since
 *   5  trainers after 1.13.0 on the drills whose rules changed after it (CHANGED_AFTER_1_13)
 *   6  trainer 1.15.0 and later on the drills whose rules changed after 1.14.0 (CHANGED_AFTER_1_14)
 *   7  trainer 1.16.0 and later on the drills whose rules changed after 1.15.0 (CHANGED_AFTER_1_15)
 */
export const COMPARED_SCORING_VERSIONS: readonly number[] = [3, 4, 5, 6, 7]

/**
 * Gridshot and Sixshot time to hit (and consistency), Tracking's turns below 360 fps, Strafe Aim's lane-edge
 * shots and Defuse Decision's consistency changed after trainer 1.13.0.
 */
const CHANGED_AFTER_1_13: ReadonlySet<string> = new Set(['gridshot', 'sixshot', 'tracking', 'strafe_aim', 'defuse_decision'])

/**
 * Changed after trainer 1.14.0, from 1.15.0: shots fired on the move stray (Trade Window, Retake Crossfire, Defuse
 * Decision), Trade Window's spacing, 3D Duel's share of peeks shot, and the Head Height drills' time limit.
 */
const CHANGED_AFTER_1_14: ReadonlySet<string> = new Set(['defuse_decision', 'trade_window', 'retake_crossfire', 'duel',
  'distance_switching', 'head_height', 'angle_clearing'])

/**
 * Changed after trainer 1.15.0, from 1.16.0: the Head Height drills' time limit to find a head and share of heads shot,
 * Retake Crossfire's isolation and defender spots, and Flash & Swing's dodges (only from a corner).
 */
const CHANGED_AFTER_1_15: ReadonlySet<string> = new Set(['head_height', 'angle_clearing', 'retake_crossfire', 'flash_swing'])

function versionParts(version: string): [number, number, number] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version.trim())
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

/** Below 0 when `v` is older than `than`, 0 when it is the same build, above 0 when newer. */
function compareVersion(v: [number, number, number], than: [number, number, number]): number {
  return v[0] !== than[0] ? v[0] - than[0] : v[1] !== than[1] ? v[1] - than[1] : v[2] - than[2]
}

/** The scoring version a trainer build's run of this drill has (scoringVersionOf), from the build's version. */
export function scoringVersionForTrainer(trainerVersion: string, scenario: string): number {
  const v = versionParts(trainerVersion)
  const after113 = CHANGED_AFTER_1_13.has(scenario) ? 5 : 4
  const after114 = CHANGED_AFTER_1_14.has(scenario) ? 6 : after113
  const newest = CHANGED_AFTER_1_15.has(scenario) ? 7 : after114
  if (!v) return newest
  const vs113 = compareVersion(v, [1, 13, 0])
  if (vs113 < 0) return 3
  if (vs113 === 0) return 4
  if (compareVersion(v, [1, 15, 0]) < 0) return after113
  return compareVersion(v, [1, 16, 0]) < 0 ? after114 : newest
}

/**
 * The version this app's bundled trainer (trainer-version.json) gives a drill's runs: its runs are "current",
 * other versions are older scoring. Set by the pin, so an app on either side of a trainer update agrees with it.
 */
export function currentScoringVersion(scenario: string): number {
  return scoringVersionForTrainer(trainerPin.version, scenario)
}

/**
 * The rules a run was scored by. Trainer 1.13.0 stamped 3 on rules that are version 4; it is the first trainer
 * that sends metadata.window, so a 3 with a window is a 4 (the API saves such runs as 4).
 */
export function scoringVersionOf(run: { metadata?: Record<string, unknown> } | null | undefined): number | null {
  const v = run?.metadata?.scoring_version
  if (typeof v !== 'number' || !Number.isInteger(v)) return null
  const window = run?.metadata?.window
  return v === 3 && typeof window === 'string' && window !== '' ? 4 : v
}

/** On a version the app compares (each only with itself); older runs stay in history uncompared. */
export function isComparableScoringRun(run: { metadata?: Record<string, unknown> } | null | undefined): boolean {
  const v = scoringVersionOf(run)
  return v !== null && COMPARED_SCORING_VERSIONS.includes(v)
}

/** On the rules this app's trainer scores the drill by: only these runs make personal bests. */
export function isCurrentScoringRun(run: { scenario: string; metadata?: Record<string, unknown> } | null | undefined): boolean {
  return !!run && scoringVersionOf(run) === currentScoringVersion(run.scenario)
}

/** A drill's best or rank group (history by_scenario, benchmark) is on this app's rules for that drill. */
export function isCurrentRulesGroup(scenario: string, group: unknown): boolean {
  const comparison = isRecord(group) ? group.comparison : null
  return isRecord(comparison) && comparison.scoring_version === currentScoringVersion(scenario)
}

/**
 * The API groups a drill by the player's newest run, which can come from an older trainer. Practice shows such a
 * group's runs but not its best: that best is from older rules (Practice shows it as an old best).
 */
export function withCurrentRulesBests<T>(history: T): T {
  if (!isRecord(history) || !isRecord(history.by_scenario)) return history
  const groups = Object.entries(history.by_scenario).map(([scenario, group]) =>
    [scenario, isRecord(group) && isRecord(group.comparison) && !isCurrentRulesGroup(scenario, group) ? { ...group, best_score: null } : group])
  return { ...history, by_scenario: Object.fromEntries(groups) } as T
}

/** Benchmark rows (best, rank against other players) only for drills whose group is on this app's rules. */
export function withCurrentRulesBenchmark<T>(benchmark: T): T {
  if (!isRecord(benchmark)) return benchmark
  return Object.fromEntries(Object.entries(benchmark)
    .filter(([scenario, row]) => !isRecord(row) || !isRecord(row.comparison) || isCurrentRulesGroup(scenario, row))) as T
}

/** 2 decimals without trailing zeros (6.75, 5.4, 6) — same as the API's TrainingComparison::number. */
function modelNumber(value: number): string {
  return String(Math.round(value * 100) / 100)
}

/**
 * The trainer measurement model a score was set on: game + movement model + effective run speed (3D)
 * or aim scale (2D). Scores are only compared within one model. Null without a game (older runs):
 * those are legacy. Must match the API's TrainingComparison::model exactly.
 */
export function trainingComparisonModel(metadata: Record<string, unknown> | null | undefined): string | null {
  const game = metadata?.game
  if (typeof game !== 'string' || game === '') return null
  const parts = [`game=${game}`]
  const movement = metadata?.movement
  if (typeof movement === 'string' && movement !== '') parts.push(`movement=${movement}`)
  for (const key of ['run_speed_mps', 'aim_scale'] as const) {
    const value = metadata?.[key]
    if (typeof value === 'number' && Number.isFinite(value)) parts.push(`${key}=${modelNumber(value)}`)
  }
  return parts.join(';')
}

/** The like-with-like group of a run: its drill, settings, game model and its own scoring version. */
export function trainingComparisonRequest(run: ComparableTrainingRun): TrainingComparisonRequest | null {
  const difficulty = run.metadata?.difficulty
  const model = trainingComparisonModel(run.metadata)
  const version = scoringVersionOf(run)
  if (version === null || !isComparableScoringRun(run) || !model || typeof difficulty !== 'string'
    || !['easy', 'medium', 'hard', 'pro'].includes(difficulty)
    || !Number.isInteger(run.duration_seconds) || run.duration_seconds < 10
    || !Number.isFinite(trainingTimestamp(run.completed_at))) return null
  return { scenario: run.scenario, duration_seconds: run.duration_seconds, difficulty,
    scoring_version: version, before: new Date(trainingTimestamp(run.completed_at)).toISOString(),
    comparison_model: model }
}
/** Same drill, settings, game model and scoring rules: never a run scored by other rules. */
export function comparableTrainingRuns(a: ComparableTrainingRun, b: ComparableTrainingRun): boolean {
  const left = trainingComparisonRequest(a), right = trainingComparisonRequest(b)
  return !!left && !!right && left.scenario === right.scenario
    && left.duration_seconds === right.duration_seconds && left.difficulty === right.difficulty
    && left.comparison_model === right.comparison_model && left.scoring_version === right.scoring_version
}

/** Godot timestamps without an offset are UTC, matching its UTC clock call. */
export function trainingTimestamp(value: string): number {
  const iso = value.replace(' ', 'T')
  return Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso) ? iso : `${iso}Z`)
}
/** Number fields of a stored run, and of a drill's group, in GET /api/training/sessions. */
const RUN_NUMBER_KEYS = ['id', 'duration_seconds', 'score', 'accuracy_pct', 'avg_reaction_ms', 'consistency_score', 'targets_hit', 'targets_missed']
const GROUP_NUMBER_KEYS = ['best_score', 'trend', 'avg_accuracy', 'avg_reaction', 'min_reaction', 'max_reaction', 'max_streak']

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** A numeric string ("72.50") as a number; anything else (null, '', other text) unchanged. */
function numberFromApi(v: unknown): unknown {
  if (typeof v !== 'string' || v.trim() === '') return v
  const n = Number(v)
  return Number.isFinite(n) ? n : v
}

function withNumbers(v: unknown, keys: string[]): unknown {
  if (!isRecord(v)) return v
  const out = { ...v }
  for (const key of keys) if (key in out) out[key] = numberFromApi(out[key])
  return out
}

/**
 * Training history with its numbers as numbers. The API keeps accuracy, reaction and consistency in
 * DECIMAL columns and MySQL sends those as strings ("72.50"): sums still work on them, `.toFixed` throws.
 * Null and anything not shaped like history come back unchanged.
 */
export function normalizeTrainingHistory<T>(data: T): T {
  if (!isRecord(data)) return data
  const withRuns = (v: Record<string, unknown>) =>
    Array.isArray(v.sessions) ? { ...v, sessions: v.sessions.map(r => withNumbers(r, RUN_NUMBER_KEYS)) } : v
  const out = withRuns(data)
  if (!isRecord(data.by_scenario)) return out as T
  const groups = Object.entries(data.by_scenario).map(([scenario, group]) => {
    const g = withNumbers(group, GROUP_NUMBER_KEYS)
    return [scenario, isRecord(g) ? withRuns(g) : g]
  })
  return { ...out, by_scenario: Object.fromEntries(groups) } as T
}

export function priorTrainingSessions<T extends ComparableTrainingRun>(sessions: T[], current: ComparableTrainingRun): T[] {
  const time = trainingTimestamp(current.completed_at)
  return sessions.filter(s => comparableTrainingRuns(s, current) && trainingTimestamp(s.completed_at) < time)
    .sort((a, b) => trainingTimestamp(b.completed_at) - trainingTimestamp(a.completed_at))
}
export function reactionMetricScore(ms: number): number {
  return Math.max(0, Math.min(100, Math.round((400 - ms) / 2.5)))
}
export function isTrackingScenario(scenario: string): boolean {
  return scenario === 'tracking' || scenario === 'strafe_track'
}

export interface TrackingTimes {
  /** Seconds with the crosshair on target. */
  onTargetSec: number
  /** Seconds that counted for tracking (target visible / firing). */
  trackedSec: number
  offTargetSec: number
}

function msOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null
}

/**
 * Time on target for tracking drills. Trainer v3 sends metadata.on_target_ms / tracked_ms and reports
 * targets_hit = targets_missed = 0, so hits/misses mean nothing here. Older runs: on_target_seconds, or
 * accuracy × duration as a last resort.
 */
export function trackingTimes(run: { duration_seconds: number; accuracy_pct: number; metadata?: Record<string, unknown> }): TrackingTimes {
  const m = run.metadata ?? {}
  const trackedMs = msOrNull(m.tracked_ms)
  const onMs = msOrNull(m.on_target_ms)
  const duration = Number.isFinite(run.duration_seconds) && run.duration_seconds > 0 ? run.duration_seconds : 0
  const trackedSec = trackedMs !== null ? trackedMs / 1000 : duration
  const legacyOn = msOrNull(m.on_target_seconds)
  const acc = Number.isFinite(run.accuracy_pct) ? Math.max(0, Math.min(100, run.accuracy_pct)) : 0
  const onTargetSec = onMs !== null ? onMs / 1000 : legacyOn !== null ? legacyOn : (acc / 100) * trackedSec
  return { onTargetSec, trackedSec, offTargetSec: Math.max(0, trackedSec - onTargetSec) }
}

export function secondsLabel(s: number): string {
  return `${(Math.round(s * 10) / 10).toFixed(1)}s`
}

export interface ResultCountCell { label: string; value: string }

/**
 * The three count cells on a result (targets, rate, misses). Tracking drills show time on target instead
 * of hits / misses / hits-per-minute, which the trainer reports as 0 for them.
 */
export function resultCountCells(run: {
  scenario: string; duration_seconds: number; accuracy_pct: number
  targets_hit: number; targets_missed: number; metadata?: Record<string, unknown>
}): ResultCountCell[] {
  if (isTrackingScenario(run.scenario)) {
    const t = trackingTimes(run)
    return [
      { label: 'Tracked time', value: secondsLabel(t.trackedSec) },
      { label: 'On-target time', value: secondsLabel(t.onTargetSec) },
      { label: 'Off-target time', value: secondsLabel(t.offTargetSec) },
    ]
  }
  const total = run.targets_hit + run.targets_missed
  return [
    { label: 'Targets', value: `${run.targets_hit}/${total}` },
    { label: 'Hits per minute', value: `${run.duration_seconds > 0 ? Math.round((run.targets_hit / run.duration_seconds) * 60) : 0}` },
    { label: 'Miss rate', value: `${total > 0 ? Math.round((run.targets_missed / total) * 100) : 0}%` },
  ]
}

/** The single "hits" cell on compact result cards: time on target for tracking drills, hits/total otherwise. */
export function resultHitsCell(run: {
  scenario: string; duration_seconds: number; accuracy_pct: number
  targets_hit: number; targets_missed: number; metadata?: Record<string, unknown>
}): ResultCountCell {
  if (isTrackingScenario(run.scenario)) return { label: 'On target', value: secondsLabel(trackingTimes(run).onTargetSec) }
  return { label: 'Hits', value: `${run.targets_hit}/${run.targets_hit + run.targets_missed}` }
}

/** Valorant beta drills whose avg_reaction_ms is a duel reaction time (Defuse Decision: lurker duels only). */
const REACTION_LABEL_SCENARIOS: ReadonlySet<string> = new Set(['flash_swing', 'operator_hold', 'defuse_decision', 'retake_crossfire'])

/**
 * Label for avg_reaction_ms. Jiggle Peek sends mean exposure time and Trade Window mean trade time
 * in that field, so "Time to hit" would be wrong for them.
 */
export function reactionMetricLabel(scenario: string): string {
  if (scenario === 'jiggle_peek') return 'Exposure'
  if (scenario === 'trade_window') return 'Trade time'
  if (REACTION_LABEL_SCENARIOS.has(scenario)) return 'Reaction'
  return 'Time to hit'
}

/** True when avg_reaction_ms is a time-to-hit (the reaction coaching lines only apply then). */
export function isTimeToHitMetric(scenario: string): boolean {
  return reactionMetricLabel(scenario) === 'Time to hit'
}

/**
 * avg_reaction_ms when it is a measured reaction / time to hit, else null. Tracking drills never
 * measure one (the trainer sends 0), a run with no hits has nothing to time, and Jiggle Peek /
 * Trade Window send other timings in that field. 0 ms is "not measured", never a real time.
 */
export function measuredReactionMs(run: { scenario: string; avg_reaction_ms: number; targets_hit?: number }): number | null {
  if (isTrackingScenario(run.scenario)) return null
  const label = reactionMetricLabel(run.scenario)
  if (label !== 'Time to hit' && label !== 'Reaction') return null
  if (run.targets_hit !== undefined && !(run.targets_hit > 0)) return null
  const ms = run.avg_reaction_ms
  return typeof ms === 'number' && Number.isFinite(ms) && ms > 0 ? ms : null
}

/** Stat line under a leaderboard name: no "0ms to hit" for tracking drills or unmeasured reactions. */
export function leaderboardStatLine(scenario: string, entry: { accuracy_pct: number; avg_reaction_ms: number }): string {
  if (isTrackingScenario(scenario)) return `${entry.accuracy_pct}% time on target`
  const label = accuracyMetricLabel(scenario).toLowerCase()
  const ms = measuredReactionMs({ scenario, avg_reaction_ms: entry.avg_reaction_ms })
  if (ms === null) return `${entry.accuracy_pct}% ${label}`
  const reaction = reactionMetricLabel(scenario) === 'Time to hit' ? `${Math.round(ms)}ms to hit` : `${Math.round(ms)}ms reaction`
  return `${entry.accuracy_pct}% ${label} · ${reaction}`
}

type ConsistencyRun = { scenario: string; targets_hit: number; metadata?: Record<string, unknown> }

/**
 * How many timings consistency_score is the spread of: the hits, unless the trainer says otherwise
 * (metadata.consistency_samples). Older trainers did not say: Trade Window times trades only (an opening
 * kill has no trade time) and Defuse Decision sent the spread of whole rounds, which is no consistency.
 */
function consistencySamples(run: ConsistencyRun): number {
  const m = run.metadata ?? {}
  const sent = countOf(m.consistency_samples)
  if (sent !== null) return sent
  if (run.scenario === 'trade_window') return countOf(m.trades) ?? 0
  if (run.scenario === 'defuse_decision') return 0
  return run.targets_hit
}

/** True when consistency_score was measured: two timings or more, and never in tracking drills. */
export function isConsistencyMeasured(run: ConsistencyRun): boolean {
  return !isTrackingScenario(run.scenario) && consistencySamples(run) >= 2
}

/** What a drill's consistency is timed over ("At least two … are needed"). */
export function consistencyTimingsLabel(scenario: string): string {
  if (scenario === 'trade_window') return 'trades'
  if (scenario === 'defuse_decision') return 'lurker kills'
  return 'successful hits'
}

/** Label for accuracy_pct (Jiggle Peek sends its safe-spot rate there). */
export function accuracyMetricLabel(scenario: string): string {
  if (isTrackingScenario(scenario)) return 'Time on target'
  if (scenario === 'jiggle_peek') return 'Safe-spot rate'
  return 'Accuracy'
}

function countOf(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null
}

function numOf(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/**
 * Drill-specific numbers for the beta duel drills, from result metadata. Cells with missing or
 * malformed values are left out (never shown as 0). Other drills return [].
 */
export function drillDetailCells(run: { scenario: string; metadata?: Record<string, unknown> }): ResultCountCell[] {
  const m = run.metadata ?? {}
  const cells: ResultCountCell[] = []
  const reps = countOf(m.reps)
  const ratio = (label: string, v: unknown, of: number | null = reps) => {
    const n = countOf(v)
    if (n !== null) cells.push({ label, value: of !== null ? `${n}/${of}` : `${n}` })
  }
  const count = (label: string, v: unknown) => ratio(label, v, null)
  const fixed = (label: string, v: unknown, unit: string, digits = 1) => {
    const n = numOf(v)
    if (n !== null) cells.push({ label, value: `${n.toFixed(digits)}${unit}` })
  }
  switch (run.scenario) {
    case 'hold_angle':
      ratio('Wins', m.wins)
      count('Deaths', m.deaths)
      count('Gave away', m.gave_away)
      count('Baits held', m.baits_held)
      fixed('Mean placement', m.mean_placement_deg, '°')
      break
    case 'jiggle_peek':
      ratio('Safe spots', m.safe_spots)
      count('Deaths', m.deaths)
      count('Blind peeks', m.blind_peeks)
      fixed('Time to spot', m.mean_spot_ms, 'ms', 0)
      break
    case 'trade_window':
      ratio('Trades', m.trades)
      ratio('Opening kills', m.opening_kills)
      count('Too early', m.too_early)
      count('Too late', m.too_late)
      count('Lost duel', m.lost_duel)
      fixed('Spacing', m.mean_spacing_m, ' m')
      break
    case 'clear_site':
      ratio('Angles cleared', m.cleared, countOf(m.angles))
      fixed('Mean placement', m.mean_placement_deg, '°')
      count('Laps', m.laps_completed)
      if (typeof m.angle_pack === 'string' && m.angle_pack) cells.push({ label: 'Angle pack', value: m.angle_pack })
      break
    case 'flash_swing':
      ratio('Wins', m.wins)
      ratio('Flashes dodged', m.flashes_dodged, countOf(m.flash_reps))
      count('Died blind', m.died_blind)
      fixed('Blind time', m.mean_blind_ms, 'ms', 0)
      break
    case 'operator_hold':
      ratio('Wins', m.wins)
      ratio('Scoped shots', m.scoped_shots, countOf(m.shots))
      count('Double swings', m.double_swings)
      fixed('Mean placement', m.mean_placement_deg, '°')
      break
    case 'defuse_decision':
      ratio('Defused', m.defused)
      ratio('Lurkers killed', m.lurkers_killed, countOf(m.lurker_reps))
      count('Half-defuse saves', m.half_defuse_saves)
      fixed('Time left', m.mean_time_left_s, ' s')
      break
    case 'retake_crossfire':
      ratio('Cleared', m.cleared)
      fixed('Isolation', m.mean_isolation_pct, '%', 0)
      ratio('Correct first', m.correct_first)
      fixed('Clear time', m.mean_clear_s, ' s')
      break
  }
  return cells
}

/**
 * The number a drill is built on, read from the run's metadata (the trainer sends it, the API stores it):
 * Head Height's placement error (with its horizontal and vertical parts), Strafe Aim's clean-stop rate
 * and 3D Duel's accuracy while moving and while still. One entry per value; the parts sit beside it.
 */
interface MeasureDef {
  key: string
  label: string
  unit: string
  digits: number
  /** Metadata count that must be above 0 for the value to be measured (the trainer sends 0 for none). */
  needs?: (m: Record<string, unknown>) => boolean
}
interface DrillMeasureDef { measures: MeasureDef[]; parts: MeasureDef[]; note: string }

const shotsAbove0 = (...keys: string[]) => (m: Record<string, unknown>) =>
  keys.reduce((t, k) => t + (countOf(m[k]) ?? 0), 0) > 0

const DRILL_MEASURES: Record<string, DrillMeasureDef> = {
  head_height: {
    measures: [{ key: 'mean_placement_error_deg', label: 'Placement error', unit: '°', digits: 2 }],
    parts: [
      { key: 'mean_horizontal_error_deg', label: 'Horizontal', unit: '°', digits: 2 },
      { key: 'mean_vertical_error_deg', label: 'Vertical', unit: '°', digits: 2 },
    ],
    note: 'Average distance from the crosshair to the head when it first became visible. Lower is better.',
  },
  strafe_aim: {
    measures: [{ key: 'counter_strafe_rate_pct', label: 'Clean stops', unit: '%', digits: 0, needs: shotsAbove0('still_shots', 'moving_shots') }],
    parts: [
      { key: 'still_shots', label: 'Shots after stopping', unit: '', digits: 0 },
      { key: 'moving_shots', label: 'Shots while moving', unit: '', digits: 0 },
    ],
    note: 'Share of shots fired at or under the game\'s accurate movement speed.',
  },
  duel: {
    measures: [
      { key: 'moving_accuracy_pct', label: 'Moving accuracy', unit: '%', digits: 0, needs: shotsAbove0('shots_while_moving') },
      { key: 'still_accuracy_pct', label: 'Still accuracy', unit: '%', digits: 0, needs: shotsAbove0('shots_while_still') },
    ],
    parts: [],
    note: 'Hits per shot, split by whether you were moving or standing still when you fired.',
  },
}

function measureValue(def: MeasureDef, m: Record<string, unknown>): number | null {
  const n = numOf(m[def.key])
  if (n === null || n < 0) return null
  return def.needs && !def.needs(m) ? null : n
}

function measureText(def: MeasureDef, n: number): string {
  return `${n.toFixed(def.digits)}${def.unit}`
}

export interface DrillMeasure {
  /** The drill's own numbers, shown before the score. */
  measures: ResultCountCell[]
  /** What makes them up (Head Height: horizontal and vertical error). */
  parts: ResultCountCell[]
  note: string
}

/** The drill's own measure for one run; null for other drills or when the run has none of its values. */
export function drillMeasure(run: { scenario: string; metadata?: Record<string, unknown> }): DrillMeasure | null {
  const def = DRILL_MEASURES[run.scenario]
  if (!def) return null
  const m = run.metadata ?? {}
  const cells = (defs: MeasureDef[]) => defs.flatMap((d) => {
    const n = measureValue(d, m)
    return n === null ? [] : [{ label: d.label, value: measureText(d, n) }]
  })
  const measures = cells(def.measures)
  if (!measures.length) return null
  return { measures, parts: cells(def.parts), note: def.note }
}

export interface DrillMeasureTrend {
  label: string
  /** Oldest first, at most the last 10 runs that measured it. */
  values: number[]
  /** The same values with their unit ("2.15°", "64%"). */
  texts: string[]
}

export const DRILL_MEASURE_TREND_RUNS = 10

/** Per-measure trend over these runs (any order): the last 10 measured values, oldest first. */
export function drillMeasureTrends(
  scenario: string,
  runs: ReadonlyArray<{ completed_at: string; metadata?: Record<string, unknown> }>,
): DrillMeasureTrend[] {
  const def = DRILL_MEASURES[scenario]
  if (!def) return []
  const ordered = [...runs].sort((a, b) => trainingTimestamp(a.completed_at) - trainingTimestamp(b.completed_at))
  return def.measures.flatMap((d) => {
    const values = ordered.map(r => measureValue(d, r.metadata ?? {}))
      .filter((n): n is number => n !== null).slice(-DRILL_MEASURE_TREND_RUNS)
    return values.length ? [{ label: d.label, values, texts: values.map(n => measureText(d, n)) }] : []
  })
}

/** SVG path for a small trend line (w × h), scaled to the values' own range; '' under two values. */
export function measureSparkPath(values: readonly number[], w: number, h: number): string {
  if (values.length < 2) return ''
  const lo = Math.min(...values), hi = Math.max(...values)
  const span = hi - lo || 1
  return 'M ' + values.map((v, i) => {
    const x = (i / (values.length - 1)) * w
    const y = hi === lo ? h / 2 : h - ((v - lo) / span) * h
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' L ')
}
