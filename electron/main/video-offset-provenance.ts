import type { MatchData } from './riot-types'

export interface TimerOffsetEvidence {
  samples: number
  rounds: number
  /** Median absolute deviation of agreeing ticks, not a calibrated error bound. */
  spreadMs: number
  outliers: number
}

/** Why the last round-timer read did not set an offset (kept so uploads show why a match fell back). */
export type TimerSyncFailureReason =
  | 'too_few_round_starts' // Riot's data had fewer than 2 round starts to line up against
  | 'no_timer_read' // no timer digits were read in the scanned windows
  | 'inconsistent' // ticks were read, but too few agreed (see the evidence numbers)
  | 'timed_out' // the scan ran past its time budget
  | 'read_error' // ffmpeg could not read the recording

export interface TimerSyncFailure extends Partial<TimerOffsetEvidence> {
  reason: TimerSyncFailureReason
}

export interface VideoOffsetProvenance {
  status: 'measured' | 'estimated' | 'unknown'
  source: 'round_timer' | 'cs2_demo_anchor' | 'user_adjusted' | 'loading_estimate' | 'match_start_estimate' | 'unavailable'
  /** None of the current estimators establishes a calibrated alignment error bound. */
  uncertaintyMs: null
  manualAdjustmentMs: number
  timer?: TimerOffsetEvidence
  /** Valorant only, when the round-timer read was tried and did not set the offset. */
  timerFailure?: TimerSyncFailure
  cs2?: { pairs: number; livePoints: number }
}

const FAILURE_REASONS: readonly TimerSyncFailureReason[] = ['too_few_round_starts', 'no_timer_read', 'inconsistent', 'timed_out', 'read_error']

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Describe the evidence actually saved with this recording; never infer measurement from an offset alone. */
export function videoOffsetProvenance(timeline: MatchData): VideoOffsetProvenance {
  const baseline = timeline.game === 'valorant' ? -8_000 : 0
  const manualAdjustmentMs = finite(timeline.videoSyncOffsetMs) ? timeline.videoSyncOffsetMs - baseline : 0
  const result: VideoOffsetProvenance = { status: 'unknown', source: 'unavailable', uncertaintyMs: null, manualAdjustmentMs }
  const timer = timeline.roundTimerEvidence
  if (timer && [timer.samples, timer.rounds, timer.outliers].every(v => Number.isInteger(v) && v >= 0)
    && finite(timer.spreadMs) && timer.spreadMs >= 0) result.timer = { ...timer }
  const failure = timeline.roundTimerFailure
  if (timeline.game === 'valorant' && !finite(timeline.roundTimerOffsetMs) && failure
    && FAILURE_REASONS.includes(failure.reason)) {
    result.timerFailure = { reason: failure.reason }
    for (const k of ['samples', 'rounds', 'spreadMs', 'outliers'] as const) {
      const v = failure[k]
      if (finite(v) && v >= 0) result.timerFailure[k] = v
    }
  }
  const cs2 = timeline.cs2DemoSyncEvidence
  if (cs2 && Number.isInteger(cs2.pairs) && Number.isInteger(cs2.livePoints) && cs2.pairs >= 0 && cs2.livePoints >= cs2.pairs) result.cs2 = { ...cs2 }

  if (manualAdjustmentMs !== 0) return { ...result, status: 'estimated', source: 'user_adjusted' }
  if (timeline.game === 'valorant' && finite(timeline.roundTimerOffsetMs)) {
    const measured = result.timer && result.timer.samples >= 6 && result.timer.rounds >= 2
      && result.timer.spreadMs <= 150 && result.timer.samples >= 2 * result.timer.outliers
    return { ...result, status: measured ? 'measured' : 'estimated', source: 'round_timer' }
  }
  if (timeline.game === 'cs2' && finite(timeline.cs2DemoVideoShiftMs)) {
    const measured = result.cs2 && result.cs2.pairs >= 3 && result.cs2.pairs >= Math.ceil(result.cs2.livePoints * 0.4)
    return { ...result, status: measured ? 'measured' : 'estimated', source: 'cs2_demo_anchor' }
  }
  if (finite(timeline.recordingStartTime) && (finite(timeline.matchStartTime) || finite(timeline.gameplayStartTime))) {
    return { ...result, status: 'estimated', source: timeline.game === 'valorant' ? 'loading_estimate' : 'match_start_estimate' }
  }
  return result
}
