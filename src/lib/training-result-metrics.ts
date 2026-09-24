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
export function trainingComparisonRequest(run: ComparableTrainingRun): TrainingComparisonRequest | null {
  const difficulty = run.metadata?.difficulty
  if (run.metadata?.scoring_version !== 2 || typeof difficulty !== 'string'
    || !['easy', 'medium', 'hard', 'pro'].includes(difficulty)
    || !Number.isInteger(run.duration_seconds) || run.duration_seconds < 10
    || !Number.isFinite(trainingTimestamp(run.completed_at))) return null
  return { scenario: run.scenario, duration_seconds: run.duration_seconds, difficulty,
    scoring_version: 2, before: new Date(trainingTimestamp(run.completed_at)).toISOString() }
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
