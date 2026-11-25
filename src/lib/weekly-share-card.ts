/**
 * Numbers on the "Share this week" picture. One window for everything: the last 7 calendar days
 * including today (local time). Every number says what it covers: the average and the change are
 * only over runs on one drill + settings (scores are not comparable across settings), the best and
 * the per-drill rows name their drill.
 */
import { comparableTrainingRuns, isCurrentScoringRun, trainingComparisonRequest, trainingTimestamp } from './training-result-metrics'

export interface WeeklyCardRun {
  scenario: string
  score: number
  completed_at: string
  duration_seconds: number
  metadata?: Record<string, unknown>
}

export interface WeeklyCardNumber { value: number; covers: string }

export interface WeeklyCardData {
  /** "12 Nov – 18 Nov 2026" */
  rangeLabel: string
  /** Every run in the window, any drill. */
  runCount: number
  /** Average over the window's runs on the newest run's drill + settings. */
  avg: WeeklyCardNumber | null
  /** That average minus the previous window's average; needs three comparable runs in each. */
  vsPrevious: WeeklyCardNumber | null
  /** Best current-scoring score in the window, with its drill. */
  best: WeeklyCardNumber | null
  /** Drills played in the window, most runs first, with proper names. */
  drills: Array<{ scenario: string; label: string; count: number }>
}

const DAY_MS = 86400000

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function dateLabel(d: Date, withYear = false): string {
  return d.toLocaleDateString('en-GB', withYear ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' })
}

function average(runs: WeeklyCardRun[]): number | null {
  return runs.length ? Math.round(runs.reduce((a, r) => a + r.score, 0) / runs.length) : null
}

export function weeklyShareCardData(
  sessions: WeeklyCardRun[],
  now: Date,
  labelOf: (scenario: string) => string,
): WeeklyCardData {
  const start = startOfLocalDay(new Date(now.getTime() - 6 * DAY_MS))
  const prevStart = startOfLocalDay(new Date(start.getTime() - 6.5 * DAY_MS))
  const at = (r: WeeklyCardRun) => trainingTimestamp(r.completed_at)
  const sorted = [...sessions].filter(r => Number.isFinite(at(r))).sort((a, b) => at(b) - at(a))
  const inWindow = sorted.filter(r => at(r) >= start.getTime() && at(r) <= now.getTime())
  const inPrevious = sorted.filter(r => at(r) >= prevStart.getTime() && at(r) < start.getTime())

  const counts = new Map<string, number>()
  for (const r of inWindow) counts.set(r.scenario, (counts.get(r.scenario) ?? 0) + 1)
  const drills = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([scenario, count]) => ({ scenario, label: labelOf(scenario), count }))

  const comparisonRun = inWindow.find(r => trainingComparisonRequest(r))
  let avg: WeeklyCardNumber | null = null
  let vsPrevious: WeeklyCardNumber | null = null
  if (comparisonRun) {
    const covers = `${labelOf(comparisonRun.scenario)} · ${comparisonRun.metadata?.difficulty} · ${comparisonRun.duration_seconds}s`
    const thisRuns = inWindow.filter(r => comparableTrainingRuns(r, comparisonRun))
    const prevRuns = inPrevious.filter(r => comparableTrainingRuns(r, comparisonRun))
    const thisAvg = average(thisRuns)
    const prevAvg = average(prevRuns)
    if (thisAvg !== null) avg = { value: thisAvg, covers }
    if (thisRuns.length >= 3 && prevRuns.length >= 3 && thisAvg !== null && prevAvg !== null) {
      vsPrevious = { value: thisAvg - prevAvg, covers }
    }
  }

  const bestRun = inWindow.filter(isCurrentScoringRun).reduce<WeeklyCardRun | null>((b, r) => (!b || r.score > b.score ? r : b), null)

  return {
    rangeLabel: `${dateLabel(start)} – ${dateLabel(now, true)}`,
    runCount: inWindow.length,
    avg,
    vsPrevious,
    best: bestRun ? { value: bestRun.score, covers: labelOf(bestRun.scenario) } : null,
    drills,
  }
}
