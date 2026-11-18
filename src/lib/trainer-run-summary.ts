/**
 * The result screen's summary of one trainer run: measured facts only. It compares with the latest
 * earlier run at the same settings, names the best and lists which numbers moved. No praise, advice or
 * causes, so it can never contradict the score label (the drill's own tip stays in its own section).
 */
import { accuracyMetricLabel, isTimeToHitMetric, isTrackingScenario, reactionMetricLabel } from './training-result-metrics'

export interface RunNumbers {
  scenario: string
  /** 0–100; shown ×10 ("/ 1000"). */
  score: number
  accuracy_pct: number
  avg_reaction_ms: number
  consistency_score: number
  targets_hit: number
}

/** ok = earlier runs loaded; failed = they could not load; none = this run is not compared (older scoring / incomplete settings). */
export type RunHistoryState = 'loading' | 'ok' | 'failed' | 'none'

export interface RunSummaryInput {
  run: RunNumbers
  /** Latest earlier run with the same drill, difficulty, length and scoring, or null. */
  previous: RunNumbers | null
  /** Best earlier score at these settings (0–100), or null. */
  best: number | null
  history: RunHistoryState
}

export interface RunSummary {
  headline: string
  details: string[]
}

const SCALE = 10

function measured(r: RunNumbers) {
  const tracking = isTrackingScenario(r.scenario)
  return {
    tracking,
    // Jiggle Peek / Trade Window send exposure / trade time in avg_reaction_ms, measured even with no hits.
    reaction: !tracking && (isTimeToHitMetric(r.scenario) ? r.targets_hit > 0 : r.avg_reaction_ms > 0),
    consistency: !tracking && r.targets_hit >= 2,
  }
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/** "accuracy 72.0% → 81.0%" for each number measured in both runs that changed. */
function movedNumbers(run: RunNumbers, previous: RunNumbers): string[] {
  const now = measured(run), before = measured(previous)
  const out: string[] = []
  const add = (label: string, from: string, to: string, unit = '') => {
    if (from !== to) out.push(`${lower(label)} ${from}${unit} → ${to}${unit}`)
  }
  add(accuracyMetricLabel(run.scenario), previous.accuracy_pct.toFixed(1), run.accuracy_pct.toFixed(1), '%')
  if (now.reaction && before.reaction) {
    const from = String(Math.round(previous.avg_reaction_ms)), to = String(Math.round(run.avg_reaction_ms))
    if (from !== to) out.push(`${lower(reactionMetricLabel(run.scenario))} ${from} → ${to} ms`)
  }
  if (now.consistency && before.consistency) add('Consistency', String(Math.round(previous.consistency_score)), String(Math.round(run.consistency_score)))
  return out
}

/** Why some numbers show "Not measured" (facts about the drill, never advice). */
function measurementNotes(run: RunNumbers): string[] {
  const m = measured(run)
  if (m.tracking) {
    return [run.scenario === 'strafe_track'
      ? 'Tracking accuracy measures time on target while firing. Reaction time and click consistency do not apply to this drill.'
      : 'Tracking accuracy measures time with the cursor on target. Reaction time and click consistency do not apply to this drill.']
  }
  const reaction = lower(reactionMetricLabel(run.scenario))
  if (!m.reaction) {
    return [run.targets_hit === 0
      ? `No successful hits recorded, so ${reaction} and consistency were not measured.`
      : `${reactionMetricLabel(run.scenario)} was not measured for this run.`]
  }
  if (!m.consistency) return ['At least two successful hits are needed to measure consistency.']
  return []
}

/**
 * Hint in place of the score-trend chart, or null. Only once earlier runs loaded: offline there is no
 * trend to promise (the summary headline says the runs did not load). `points` includes this run.
 */
export function runTrendMessage(history: RunHistoryState, points: number): string | null {
  return history === 'ok' && points < 2 ? 'Play another run with the same difficulty and length to see a trend.' : null
}

export interface RankedRun { score: number; completed_at: string; isCurrent: boolean; rank: number }

/**
 * Best runs at these settings, this one included, highest first. Empty unless earlier runs loaded:
 * offline the run would otherwise rank "★1" against nothing.
 */
export function topRuns(
  history: RunHistoryState,
  prior: ReadonlyArray<{ score: number; completed_at: string }>,
  current: { score: number; completed_at: string },
  limit = 6,
): RankedRun[] {
  if (history !== 'ok') return []
  return [
    ...prior.map(s => ({ score: s.score, completed_at: s.completed_at, isCurrent: false })),
    { score: current.score, completed_at: current.completed_at, isCurrent: true },
  ]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s, i) => ({ ...s, rank: i + 1 }))
}

export function trainerRunSummary({ run, previous, best, history }: RunSummaryInput): RunSummary {
  const notes = measurementNotes(run)
  if (history === 'loading') return { headline: 'Loading your earlier runs…', details: notes }
  if (history === 'failed') return { headline: 'Couldn’t load your earlier runs, so this run isn’t compared yet.', details: notes }
  if (history === 'none') return { headline: 'Not compared with your other runs: this run used older scoring or incomplete settings.', details: notes }
  if (!previous) return { headline: 'First run at these settings.', details: notes }

  const score = run.score * SCALE, prev = previous.score * SCALE
  const delta = score - prev
  const headline = delta > 0
    ? `Up ${delta} from your last run at these settings (${prev} → ${score}).`
    : delta < 0
      ? `Down ${-delta} from your last run at these settings (${prev} → ${score}).`
      : `Same score as your last run at these settings (${score}).`

  const details: string[] = []
  if (best !== null) {
    if (run.score > best) details.push(`New best at these settings. Previous best: ${best * SCALE}.`)
    else if (run.score === best) details.push(`Matches your best at these settings (${best * SCALE}).`)
    else details.push(`Best at these settings: ${best * SCALE}.`)
  }
  const moved = movedNumbers(run, previous)
  if (moved.length) details.push(`Since your last run: ${moved.join(', ')}.`)
  return { headline, details: [...details, ...notes] }
}
