import { describe, expect, it } from 'vitest'
import { CURRENT_SCORING_VERSION, priorTrainingSessions, reactionMetricScore, resultCountCells, resultHitsCell, trackingTimes, trainingTimestamp, trainingComparisonRequest, trainingComparisonModel } from './training-result-metrics'
describe('training result measurements', () => {
  it('compares the last completed run whether the current run has synced or not', () => {
    const current = { scenario: 'flick', duration_seconds: 60, metadata: { difficulty: 'medium', scoring_version: 3, game: 'valorant' }, completed_at: '2026-09-24T12:00:00', score: 39 }
    const previous = { ...current, completed_at: '2026-09-24T11:00:00.000000Z', score: 38 }
    expect(priorTrainingSessions([previous], current)).toEqual([previous])
    expect(priorTrainingSessions([{ ...current, completed_at: current.completed_at + 'Z' }, previous], current)).toEqual([previous])
    expect(priorTrainingSessions([current], current)).toEqual([])
  })
  it('excludes legacy, different difficulty, duration and drill from comparisons', () => {
    const current = { scenario: 'flick', duration_seconds: 60, metadata: { difficulty: 'medium', scoring_version: 3, game: 'valorant' }, completed_at: '2026-09-24T12:00:00Z' }
    const previous = { ...current, completed_at: '2026-09-24T11:00:00Z' }
    expect(priorTrainingSessions([
      previous, { ...previous, metadata: undefined }, { ...previous, duration_seconds: 120 },
      { ...previous, scenario: 'sixshot' }, { ...previous, metadata: { difficulty: 'hard', scoring_version: 3, game: 'valorant' } },
      { ...previous, metadata: { difficulty: 'medium', scoring_version: 1 } },
      { ...previous, metadata: { difficulty: 'medium', scoring_version: 2 } },
    ], current)).toEqual([previous])
    expect(trainingComparisonRequest({ ...current, metadata: {} })).toBeNull()
    expect(priorTrainingSessions([previous], { ...current, metadata: undefined })).toEqual([])
  })
  it('uses the same reaction benchmark as the trainer', () => {
    expect([150, 300, 400, 900].map(reactionMetricScore)).toEqual([100, 40, 0, 0])
  })
  it('interprets Godot UTC times independently of local timezone', () => {
    expect(trainingTimestamp('2026-09-24T12:00:00')).toBe(Date.parse('2026-09-24T12:00:00Z'))
  })
  it('asks the API for current-scoring comparisons only', () => {
    expect(CURRENT_SCORING_VERSION).toBe(3)
    const run = { scenario: 'flick', duration_seconds: 60, metadata: { difficulty: 'medium', scoring_version: 3, game: 'valorant' }, completed_at: '2026-11-04T12:00:00Z' }
    expect(trainingComparisonRequest(run)?.scoring_version).toBe(3)
    expect(trainingComparisonRequest({ ...run, metadata: { difficulty: 'medium', scoring_version: 2 } })).toBeNull()
  })
  it('shows time on target, not hits, for tracking drills', () => {
    const tracking = { scenario: 'tracking', duration_seconds: 60, accuracy_pct: 40, targets_hit: 0, targets_missed: 0,
      metadata: { scoring_version: 3, on_target_ms: 24_000, tracked_ms: 58_000 } }
    expect(trackingTimes(tracking)).toEqual({ onTargetSec: 24, trackedSec: 58, offTargetSec: 34 })
    expect(resultCountCells(tracking)).toEqual([
      { label: 'Tracked time', value: '58.0s' }, { label: 'On-target time', value: '24.0s' }, { label: 'Off-target time', value: '34.0s' },
    ])
    expect(resultHitsCell({ ...tracking, scenario: 'strafe_track' })).toEqual({ label: 'On target', value: '24.0s' })
    // older tracking runs without the ms keys fall back to accuracy × duration
    expect(trackingTimes({ ...tracking, metadata: {} }).onTargetSec).toBe(24)
    expect(resultCountCells({ scenario: 'flick', duration_seconds: 60, accuracy_pct: 80, targets_hit: 40, targets_missed: 10 })).toEqual([
      { label: 'Targets', value: '40/50' }, { label: 'Hits per minute', value: '40' }, { label: 'Miss rate', value: '20%' },
    ])
    expect(resultHitsCell({ scenario: 'flick', duration_seconds: 60, accuracy_pct: 80, targets_hit: 40, targets_missed: 10 })).toEqual({ label: 'Hits', value: '40/50' })
  })
})

describe('beta duel drill result labels', () => {
  it('labels avg_reaction_ms per drill', async () => {
    const { reactionMetricLabel, isTimeToHitMetric, accuracyMetricLabel } = await import('./training-result-metrics')
    expect(reactionMetricLabel('jiggle_peek')).toBe('Exposure')
    expect(reactionMetricLabel('trade_window')).toBe('Trade time')
    expect(reactionMetricLabel('hold_angle')).toBe('Time to hit')
    expect(isTimeToHitMetric('flick')).toBe(true)
    expect(isTimeToHitMetric('trade_window')).toBe(false)
    expect(accuracyMetricLabel('jiggle_peek')).toBe('Safe-spot rate')
    expect(accuracyMetricLabel('tracking')).toBe('Time on target')
    expect(accuracyMetricLabel('clear_site')).toBe('Accuracy')
  })
  it('shows drill metadata and leaves out missing values', async () => {
    const { drillDetailCells } = await import('./training-result-metrics')
    expect(drillDetailCells({ scenario: 'hold_angle', metadata: { reps: 10, wins: 7, deaths: 3, gave_away: 1, baits_held: 2, mean_placement_deg: 1.234 } }))
      .toEqual([
        { label: 'Wins', value: '7/10' }, { label: 'Deaths', value: '3' }, { label: 'Gave away', value: '1' },
        { label: 'Baits held', value: '2' }, { label: 'Mean placement', value: '1.2°' },
      ])
    expect(drillDetailCells({ scenario: 'jiggle_peek', metadata: { reps: 8, safe_spots: 5, mean_spot_ms: 181.6 } }))
      .toEqual([{ label: 'Safe spots', value: '5/8' }, { label: 'Time to spot', value: '182ms' }])
    expect(drillDetailCells({ scenario: 'trade_window', metadata: { trades: 'x', mean_spacing_m: 3.5 } }))
      .toEqual([{ label: 'Spacing', value: '3.5 m' }])
    expect(drillDetailCells({ scenario: 'clear_site', metadata: { angle_pack: 'a_site', angles: 6, cleared: 4, laps_completed: 2 } }))
      .toEqual([{ label: 'Angles cleared', value: '4/6' }, { label: 'Laps', value: '2' }, { label: 'Angle pack', value: 'a_site' }])
    expect(drillDetailCells({ scenario: 'flick', metadata: { reps: 3 } })).toEqual([])
  })
  it('shows the Valorant beta drill numbers and labels reaction as Reaction', async () => {
    const { drillDetailCells, reactionMetricLabel } = await import('./training-result-metrics')
    for (const key of ['flash_swing', 'operator_hold', 'defuse_decision', 'retake_crossfire']) expect(reactionMetricLabel(key)).toBe('Reaction')
    expect(drillDetailCells({ scenario: 'flash_swing', metadata: { reps: 10, flash_reps: 6, wins: 7, flashes_dodged: 5, died_blind: 1, mean_blind_ms: 412.4 } }))
      .toEqual([
        { label: 'Wins', value: '7/10' }, { label: 'Flashes dodged', value: '5/6' },
        { label: 'Died blind', value: '1' }, { label: 'Blind time', value: '412ms' },
      ])
    expect(drillDetailCells({ scenario: 'operator_hold', metadata: { reps: 8, wins: 6, shots: 9, scoped_shots: 8, double_swings: 2, mean_placement_deg: 0.84 } }))
      .toEqual([
        { label: 'Wins', value: '6/8' }, { label: 'Scoped shots', value: '8/9' },
        { label: 'Double swings', value: '2' }, { label: 'Mean placement', value: '0.8°' },
      ])
    expect(drillDetailCells({ scenario: 'defuse_decision', metadata: { reps: 6, lurker_reps: 3, defused: 4, lurkers_killed: 2, half_defuse_saves: 1, mean_time_left_s: 2.25 } }))
      .toEqual([
        { label: 'Defused', value: '4/6' }, { label: 'Lurkers killed', value: '2/3' },
        { label: 'Half-defuse saves', value: '1' }, { label: 'Time left', value: '2.3 s' },
      ])
    expect(drillDetailCells({ scenario: 'retake_crossfire', metadata: { reps: 5, cleared: 3, mean_isolation_pct: 71.6, correct_first: 4, layout_ids: ['a'] } }))
      .toEqual([{ label: 'Cleared', value: '3/5' }, { label: 'Isolation', value: '72%' }, { label: 'Correct first', value: '4/5' }])
  })
})

describe('trainer comparison model (game + movement)', () => {
  // What the trainer emits for a 60 s medium v3 Strafe Aim run, with the game the desktop launched it with.
  const base = { scenario: 'strafe_aim', duration_seconds: 60, completed_at: '2026-11-18T12:00:00Z' }
  const valorant = { ...base, metadata: { difficulty: 'medium', scoring_version: 3, game: 'valorant', movement: 'valorant_v1', run_speed_mps: 5.4 } }
  const cs2 = { ...base, completed_at: '2026-11-18T11:00:00Z', metadata: { difficulty: 'medium', scoring_version: 3, game: 'cs2', movement: 'snappy_v0', run_speed_mps: 6.75 } }

  it('builds the same canonical key as the API', () => {
    expect(trainingComparisonModel(valorant.metadata)).toBe('game=valorant;movement=valorant_v1;run_speed_mps=5.4')
    expect(trainingComparisonModel(cs2.metadata)).toBe('game=cs2;movement=snappy_v0;run_speed_mps=6.75')
    expect(trainingComparisonModel({ game: 'valorant', run_speed_mps: 6.0 })).toBe('game=valorant;run_speed_mps=6')
    expect(trainingComparisonModel({ game: 'valorant', aim_scale: 0.5 })).toBe('game=valorant;aim_scale=0.5')
    expect(trainingComparisonModel({ movement: 'valorant_v1' })).toBeNull()
  })
  it('never compares runs from another game or movement speed', () => {
    const earlierValorant = { ...valorant, completed_at: '2026-11-18T10:00:00Z' }
    const fasterValorant = { ...earlierValorant, metadata: { ...valorant.metadata, run_speed_mps: 9 } }
    expect(priorTrainingSessions([cs2, earlierValorant, fasterValorant], valorant)).toEqual([earlierValorant])
    expect(trainingComparisonRequest(valorant)?.comparison_model).toBe('game=valorant;movement=valorant_v1;run_speed_mps=5.4')
  })
  it('treats a run without a game as legacy, not a matching comparison', () => {
    const legacy = { ...valorant, metadata: { difficulty: 'medium', scoring_version: 3, movement: 'valorant_v1', run_speed_mps: 5.4 } }
    expect(trainingComparisonRequest(legacy)).toBeNull()
    expect(priorTrainingSessions([{ ...legacy, completed_at: '2026-11-18T10:00:00Z' }], valorant)).toEqual([])
  })
})

describe('measured reaction (0 ms = not measured)', () => {
  it('returns null for tracking drills, zero-hit runs and 0 ms', async () => {
    const { measuredReactionMs } = await import('./training-result-metrics')
    expect(measuredReactionMs({ scenario: 'strafe_track', avg_reaction_ms: 0, targets_hit: 0 })).toBeNull()
    expect(measuredReactionMs({ scenario: 'tracking', avg_reaction_ms: 180, targets_hit: 0 })).toBeNull()
    expect(measuredReactionMs({ scenario: 'gridshot', avg_reaction_ms: 0, targets_hit: 0 })).toBeNull()
    expect(measuredReactionMs({ scenario: 'gridshot', avg_reaction_ms: 150, targets_hit: 0 })).toBeNull()
    expect(measuredReactionMs({ scenario: 'jiggle_peek', avg_reaction_ms: 150, targets_hit: 4 })).toBeNull()
    expect(measuredReactionMs({ scenario: 'gridshot', avg_reaction_ms: 312, targets_hit: 20 })).toBe(312)
    expect(measuredReactionMs({ scenario: 'flash_swing', avg_reaction_ms: 240, targets_hit: 3 })).toBe(240)
  })

  it('leaderboard rows never print 0ms', async () => {
    const { leaderboardStatLine } = await import('./training-result-metrics')
    expect(leaderboardStatLine('strafe_track', { accuracy_pct: 62, avg_reaction_ms: 0 })).toBe('62% time on target')
    expect(leaderboardStatLine('tracking', { accuracy_pct: 48, avg_reaction_ms: 0 })).not.toContain('ms')
    expect(leaderboardStatLine('gridshot', { accuracy_pct: 80, avg_reaction_ms: 0 })).toBe('80% accuracy')
    expect(leaderboardStatLine('gridshot', { accuracy_pct: 80, avg_reaction_ms: 301.4 })).toBe('80% accuracy · 301ms to hit')
  })
})
