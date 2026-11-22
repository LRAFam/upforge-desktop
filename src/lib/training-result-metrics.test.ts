import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { comparableTrainingRuns, currentScoringVersion, isCurrentRulesGroup, isCurrentScoringRun, normalizeTrainingHistory, priorTrainingSessions, reactionMetricScore, resultCountCells, resultHitsCell, scoringVersionForTrainer, scoringVersionOf, trackingTimes, trainingTimestamp, trainingComparisonRequest, trainingComparisonModel, withCurrentRulesBenchmark, withCurrentRulesBests } from './training-result-metrics'
import { trainerRunSummary } from './trainer-run-summary'
import type { TrainingHistory } from '../env'
import trainerPin from '../../trainer-version.json'

describe('scoring versions: a run is only compared with runs scored by the same rules', () => {
  const CHANGED_AFTER_1_13 = ['gridshot', 'sixshot', 'tracking', 'strafe_aim', 'defuse_decision']
  const run = (scenario: string, stamp: Record<string, unknown>, completed_at = '2026-11-22T12:00:00Z', score = 50) =>
    ({ scenario, duration_seconds: 60, score, completed_at, metadata: { difficulty: 'medium', game: 'valorant', ...stamp } })
  const v4 = { scoring_version: 4 }
  const v5 = { scoring_version: 5, window: 'exclusive' }
  const trainer113 = { scoring_version: 3, window: 'window_fallback' }

  it('reads trainer 1.13.0 runs (stamped 3, with a window) as version 4', () => {
    expect(scoringVersionOf(run('flick', trainer113))).toBe(4)
    expect(scoringVersionOf(run('flick', { scoring_version: 3 }))).toBe(3)
    expect(scoringVersionOf(run('flick', { scoring_version: 3, window: '' }))).toBe(3)
    expect(scoringVersionOf(run('strafe_aim', v5))).toBe(5)
    expect(scoringVersionOf(run('flick', {}))).toBeNull()
  })

  it('knows what each trainer build stamps on every drill', () => {
    for (const drill of ['flick', ...CHANGED_AFTER_1_13]) {
      expect(scoringVersionForTrainer('1.12.0', drill)).toBe(3)
      expect(scoringVersionForTrainer('1.13.0', drill)).toBe(4)
      const next = CHANGED_AFTER_1_13.includes(drill) ? 5 : 4
      for (const later of ['1.13.1', '1.14.0', '2.0.0']) expect(scoringVersionForTrainer(later, drill)).toBe(next)
    }
    // "Current" follows the trainer this app bundles.
    for (const drill of ['flick', 'strafe_aim']) {
      expect(currentScoringVersion(drill)).toBe(scoringVersionForTrainer(trainerPin.version, drill))
      expect(isCurrentScoringRun(run(drill, { scoring_version: currentScoringVersion(drill) }))).toBe(true)
      expect(isCurrentScoringRun(run(drill, { scoring_version: 3 }))).toBe(false)
    }
  })

  it('a run from the new trainer is never compared with a run scored by older rules', () => {
    const newRun = run('strafe_aim', v5, '2026-11-23T12:00:00Z', 40)
    const older = [run('strafe_aim', trainer113, '2026-11-20T12:00:00Z', 70), run('strafe_aim', v4, '2026-11-21T12:00:00Z', 72),
      run('strafe_aim', { scoring_version: 3 }, '2026-11-10T12:00:00Z', 89)]
    const sameRules = run('strafe_aim', v5, '2026-11-22T12:00:00Z', 35)
    for (const r of older) expect(comparableTrainingRuns(newRun, r)).toBe(false)
    expect(priorTrainingSessions([...older, sameRules], newRun)).toEqual([sameRules])
    // A drill whose rules did not change after 1.13.0 keeps comparing with its 1.13.0 runs, never with 1.12.0 ones.
    const flick = run('flick', v4, '2026-11-23T12:00:00Z')
    const flick113 = run('flick', trainer113, '2026-11-20T12:00:00Z')
    expect(priorTrainingSessions([flick113, run('flick', { scoring_version: 3 }, '2026-11-10T12:00:00Z')], flick)).toEqual([flick113])
  })

  it('Practice keeps a best and a rank only when they are on this app’s rules for the drill', () => {
    const group = (scenario: string, version: number) => ({ best_score: 80, trend: 2, sessions: [],
      comparison: { difficulty: 'medium', duration_seconds: 60, scoring_version: version } })
    const flickNow = currentScoringVersion('flick'), strafeNow = currentScoringVersion('strafe_aim')
    const history = { sessions: [], total: 3, by_scenario: {
      flick: group('flick', flickNow), strafe_aim: group('strafe_aim', strafeNow - 1), gridshot: { best_score: null, comparison: null, trend: null, sessions: [] },
    } }
    expect(isCurrentRulesGroup('flick', history.by_scenario.flick)).toBe(true)
    const shown = withCurrentRulesBests(history)
    expect(shown.by_scenario.flick.best_score).toBe(80)
    // An older group's runs stay; its best does not.
    expect(shown.by_scenario.strafe_aim).toEqual({ ...history.by_scenario.strafe_aim, best_score: null })
    expect(shown.by_scenario.gridshot).toEqual(history.by_scenario.gridshot)
    expect(withCurrentRulesBests(null)).toBeNull()

    const row = (version: number) => ({ comparison: { difficulty: 'medium', duration_seconds: 60, scoring_version: version }, user_best: 80, global_rank: 2 })
    expect(Object.keys(withCurrentRulesBenchmark({ flick: row(flickNow), strafe_aim: row(strafeNow - 1) }))).toEqual(['flick'])
  })

  it('Practice applies that to every history and benchmark it shows', () => {
    const view = readFileSync(resolve(__dirname, '../views/TrainingHubView.vue'), 'utf8')
    expect(view).toMatch(/apiHistory\.value = withCurrentRulesBests\(history\)/)
    expect(view).toMatch(/benchmarkData\.value = withCurrentRulesBenchmark\(benchmark\)/)
    expect(view).not.toMatch(/apiHistory\.value = h\b/)
    // A best at settings other than the API's group is looked up on this app's rules too.
    expect(view).toMatch(/currentScoringVersion\(scenario\),\n\s*\)/)
  })
})
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
  it('asks the API for runs on the same scoring rules as the run, never legacy ones', () => {
    const run = { scenario: 'flick', duration_seconds: 60, metadata: { difficulty: 'medium', scoring_version: 3, game: 'valorant' }, completed_at: '2026-11-04T12:00:00Z' }
    expect(trainingComparisonRequest(run)?.scoring_version).toBe(3)
    // Trainer 1.13.0 stamped 3 on its own rules (version 4); it is the first to send metadata.window.
    expect(trainingComparisonRequest({ ...run, metadata: { ...run.metadata, window: 'exclusive' } })?.scoring_version).toBe(4)
    expect(trainingComparisonRequest({ ...run, metadata: { ...run.metadata, scoring_version: 5, window: 'exclusive' } })?.scoring_version).toBe(5)
    expect(trainingComparisonRequest({ ...run, metadata: { difficulty: 'medium', scoring_version: 2 } })).toBeNull()
    expect(trainingComparisonRequest({ ...run, metadata: { ...run.metadata, scoring_version: 6 } })).toBeNull()
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

describe('training history from the API: numbers as numbers', () => {
  // GET /api/training/sessions as the live API (MySQL) sends it: DECIMAL columns arrive as strings.
  const row = '{"id":7,"scenario":"flick","duration_seconds":60,"score":60,"accuracy_pct":"72.50","avg_reaction_ms":"340.00","consistency_score":"60.00","targets_hit":38,"targets_missed":12,"metadata":{"difficulty":"medium","scoring_version":3,"game":"valorant"},"completed_at":"2026-11-18T11:00:00.000000Z"}'
  const apiJson = `{"sessions":[${row}],"by_scenario":{"flick":{"best_score":64,"comparison":null,"avg_accuracy":72.5,"trend":null,"sessions":[${row}]},"gridshot":{"best_score":null,"comparison":null,"trend":null,"sessions":[]}},"total":1}`

  it('turns decimal strings into numbers in both session lists and leaves everything else alone', () => {
    const h = normalizeTrainingHistory(JSON.parse(apiJson))
    for (const r of [h.sessions[0], h.by_scenario.flick.sessions[0]]) {
      expect(r).toMatchObject({ id: 7, score: 60, accuracy_pct: 72.5, avg_reaction_ms: 340, consistency_score: 60, targets_hit: 38, targets_missed: 12 })
      expect(r.completed_at).toBe('2026-11-18T11:00:00.000000Z')
      expect(r.metadata).toEqual({ difficulty: 'medium', scoring_version: 3, game: 'valorant' })
    }
    expect(h.by_scenario.flick.best_score).toBe(64)
    expect(h.by_scenario.gridshot).toEqual({ best_score: null, comparison: null, trend: null, sessions: [] })
    expect(h.total).toBe(1)
  })

  it('is null-safe and keeps values that are not numbers', () => {
    expect(normalizeTrainingHistory(null)).toBeNull()
    const odd = normalizeTrainingHistory({ sessions: [{ accuracy_pct: null, avg_reaction_ms: '', consistency_score: 'n/a' }, null], by_scenario: [] })
    expect(odd.sessions).toEqual([{ accuracy_pct: null, avg_reaction_ms: '', consistency_score: 'n/a' }, null])
    expect(odd.by_scenario).toEqual([])
  })

  it('a repeat run on the result screen compares with the API row without throwing', () => {
    const h = normalizeTrainingHistory(JSON.parse(apiJson) as TrainingHistory)
    const current = { scenario: 'flick', duration_seconds: 60, score: 64, accuracy_pct: 81, avg_reaction_ms: 310, consistency_score: 58, targets_hit: 40,
      metadata: { difficulty: 'medium', scoring_version: 3, game: 'valorant' }, completed_at: '2026-11-18T12:00:00' }
    const previous = priorTrainingSessions(h.by_scenario.flick.sessions, current)[0]
    expect(trainerRunSummary({ run: current, previous, best: h.by_scenario.flick.best_score, history: 'ok' }).details)
      .toContain('Since your last run: accuracy 72.5% → 81.0%, time to hit 340 → 310 ms, consistency 60 → 58.')
  })

  it('the desktop normalises history where trainer:get-history returns it', () => {
    const ipc = readFileSync(resolve(__dirname, '../../electron/main/ipc/gaming-ipc.ts'), 'utf8')
    const handler = ipc.slice(ipc.indexOf("'trainer:get-history'"), ipc.indexOf("'trainer:get-plan'"))
    expect(handler).toMatch(/return normalizeTrainingHistory\(res\.data/)
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

describe('numbers a run did not measure are not shown', () => {
  it('a 100-point Trade Window run of opening kills shows them, and no trade time or spacing', async () => {
    const { drillDetailCells } = await import('./training-result-metrics')
    // What the trainer sends now: no mean_trade_ms / mean_spacing_m when nothing was timed.
    expect(drillDetailCells({ scenario: 'trade_window', metadata: { reps: 24, trades: 0, opening_kills: 24, too_early: 0, too_late: 0, lost_duel: 0, headshots: 24 } }))
      .toEqual([
        { label: 'Trades', value: '0/24' }, { label: 'Opening kills', value: '24/24' },
        { label: 'Too early', value: '0' }, { label: 'Too late', value: '0' }, { label: 'Lost duel', value: '0' },
      ])
  })

  it('consistency needs two timings: trades in Trade Window, lurker duels in Defuse Decision, hits elsewhere', async () => {
    const { isConsistencyMeasured } = await import('./training-result-metrics')
    // Trade Window: an opening kill is a hit with no trade time.
    expect(isConsistencyMeasured({ scenario: 'trade_window', targets_hit: 24, metadata: { trades: 0, opening_kills: 24 } })).toBe(false)
    expect(isConsistencyMeasured({ scenario: 'trade_window', targets_hit: 9, metadata: { trades: 1, opening_kills: 8 } })).toBe(false)
    expect(isConsistencyMeasured({ scenario: 'trade_window', targets_hit: 5, metadata: { trades: 3, opening_kills: 2 } })).toBe(true)
    // Defuse Decision: the trainer says how many duel times it used. Older trainers sent the spread of whole
    // rounds (0 on a clean 94-point run), which is not a consistency.
    expect(isConsistencyMeasured({ scenario: 'defuse_decision', targets_hit: 5, metadata: { lurkers_killed: 4, consistency_samples: 4 } })).toBe(true)
    expect(isConsistencyMeasured({ scenario: 'defuse_decision', targets_hit: 5, metadata: { lurkers_killed: 1, consistency_samples: 1 } })).toBe(false)
    expect(isConsistencyMeasured({ scenario: 'defuse_decision', targets_hit: 5, metadata: { lurkers_killed: 4 } })).toBe(false)
    // Every other drill: its hits; never for tracking drills.
    expect(isConsistencyMeasured({ scenario: 'flick', targets_hit: 2 })).toBe(true)
    expect(isConsistencyMeasured({ scenario: 'hold_angle', targets_hit: 1, metadata: { wins: 1 } })).toBe(false)
    expect(isConsistencyMeasured({ scenario: 'tracking', targets_hit: 40 })).toBe(false)
  })

  it('the result screen shows Consistency only when it was measured', () => {
    const view = readFileSync(resolve(__dirname, '../views/TrainerResultsView.vue'), 'utf8')
    expect(view).toMatch(/const hasConsistency = computed\(\(\) => isConsistencyMeasured\(result\.value\)\)/)
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
