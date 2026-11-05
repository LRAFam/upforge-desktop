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
}
/**
 * Trainer scoring version this desktop understands as "current" (trainer sends metadata.scoring_version).
 * v3 (Nov 2026) fixed scoring; v2 and older runs are legacy relative to it and are never compared with v3:
 * personal bests, comparisons and leaderboards only use runs of this version.
 */
export const CURRENT_SCORING_VERSION = 3

export function scoringVersionOf(run: { metadata?: Record<string, unknown> } | null | undefined): number | null {
  const v = run?.metadata?.scoring_version
  return typeof v === 'number' && Number.isInteger(v) ? v : null
}

export function isCurrentScoringRun(run: { metadata?: Record<string, unknown> } | null | undefined): boolean {
  return scoringVersionOf(run) === CURRENT_SCORING_VERSION
}

export function trainingComparisonRequest(run: ComparableTrainingRun): TrainingComparisonRequest | null {
  const difficulty = run.metadata?.difficulty
  if (!isCurrentScoringRun(run) || typeof difficulty !== 'string'
    || !['easy', 'medium', 'hard', 'pro'].includes(difficulty)
    || !Number.isInteger(run.duration_seconds) || run.duration_seconds < 10
    || !Number.isFinite(trainingTimestamp(run.completed_at))) return null
  return { scenario: run.scenario, duration_seconds: run.duration_seconds, difficulty,
    scoring_version: CURRENT_SCORING_VERSION, before: new Date(trainingTimestamp(run.completed_at)).toISOString() }
}
export function comparableTrainingRuns(a: ComparableTrainingRun, b: ComparableTrainingRun): boolean {
  const left = trainingComparisonRequest(a), right = trainingComparisonRequest(b)
  return !!left && !!right && left.scenario === right.scenario
    && left.duration_seconds === right.duration_seconds && left.difficulty === right.difficulty
}

/** Godot timestamps without an offset are UTC, matching its UTC clock call. */
export function trainingTimestamp(value: string): number {
  const iso = value.replace(' ', 'T')
  return Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso) ? iso : `${iso}Z`)
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
