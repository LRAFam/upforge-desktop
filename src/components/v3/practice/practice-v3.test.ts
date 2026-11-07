import { describe, expect, it } from 'vitest'
import {
  cleanDrillTitle,
  pickNextDrill,
  practiceRouteFromReport,
  durationLabel,
  matchDrillRows,
  noBestCaption,
  oldScoringBests,
  oldScoringNote,
  personalBestLabel,
  practiceGameScope,
  practiceStatItems,
  sessionMinutes,
} from './practice-v3'

describe('practiceStatItems', () => {
  it('shows 0 for no streak (like the other counts) and hides the weekly comparison when there is none', () => {
    const items = practiceStatItems({ streak: 0, thisWeekCount: 1, improvement: null, totalSessions: 4, comparisonLabel: 'No matching runs' })
    expect(items.map(i => i.value)).toEqual(['0', '1', '4'])
    expect(items[1].label).toBe('session this week')
  })

  it('colours the weekly change by direction', () => {
    const up = practiceStatItems({ streak: 3, thisWeekCount: 5, improvement: 4, totalSessions: 20, comparisonLabel: 'Flick · medium · 60s' })
    expect(up[2]).toMatchObject({ value: '+4', tone: 'win', title: 'Matched runs: Flick · medium · 60s' })
    const down = practiceStatItems({ streak: 3, thisWeekCount: 5, improvement: -2, totalSessions: 20, comparisonLabel: 'x' })
    expect(down[2]).toMatchObject({ value: '-2', tone: 'loss' })
    const flat = practiceStatItems({ streak: 3, thisWeekCount: 5, improvement: 0, totalSessions: 20, comparisonLabel: 'x' })
    expect(flat[2].tone).toBeUndefined()
  })
})

describe('labels', () => {
  it('formats durations and personal bests without inventing values', () => {
    expect(durationLabel(60)).toBe('1 min')
    expect(durationLabel(45)).toBe('45 s')
    expect(durationLabel(0)).toBe('')
    expect(personalBestLabel(71.6)).toBe('72')
    expect(personalBestLabel(null)).toBe('Not played')
  })
})

describe('session and recommendations', () => {
  it('rounds the session length up to whole minutes', () => {
    expect(sessionMinutes([])).toBeNull()
    expect(sessionMinutes([{ phaseLabel: 'Warm-up', scenario: 'flick', duration_seconds: 60 }, { phaseLabel: 'Focus', scenario: 'tracking', duration_seconds: 90 }])).toBe(3)
  })
})

describe('scoring update', () => {
  const runs = [
    { scenario: 'flick', score: 48, metadata: { difficulty: 'medium' } },
    { scenario: 'flick', score: 53 },
    { scenario: 'duel', score: 41, metadata: { scoring_version: 3, difficulty: 'medium' } },
  ]
  it('keeps old-scoring bests apart from current runs', () => {
    expect(oldScoringBests(runs)).toEqual({ flick: 53 })
    // v2 runs are legacy relative to scoring v3
    expect(oldScoringBests([...runs, { scenario: 'duel', score: 70, metadata: { scoring_version: 2, difficulty: 'medium' } }])).toEqual({ flick: 53, duel: 70 })
    expect(oldScoringBests(null)).toEqual({})
  })
  it('explains why old runs have no personal best', () => {
    expect(oldScoringNote(runs, 3)).toBe('Your 2 runs from before Nov 2026 used the old scoring, so they don’t count towards personal bests. They stay in your history.')
    expect(oldScoringNote(runs, 80)).toMatch(/^Runs from before Nov 2026/)
    expect(oldScoringNote([runs[2]], 1)).toBeNull()
  })
  it('captions a drill with no current best', () => {
    expect(noBestCaption(53.4)).toBe('Old best 53')
    expect(noBestCaption(undefined)).toBe('Not played')
  })
})

describe('drills from your matches', () => {
  const label = (k: string) => ({ flick: 'Flick' } as Record<string, string>)[k]
  it('titles rows by the coaching drill, never a stand-in trainer drill', () => {
    const rows = matchDrillRows([
      { id: 1, category: 'utility_usage', title: 'Empress Timing — Pre-Execute Only Custom Practice (Hard)', instructions: ' Load Haven. ', success_metric: 'Never early.', practice_mode: 'custom_game', trainer_scenario: null },
      { id: 2, category: 'mechanics', title: 'Flick Warm-up (Hard) (Pro)', instructions: null, success_metric: null, practice_mode: null, trainer_scenario: 'flick' },
      { id: 3, category: 'agent_specific', title: 'Chamber TP Reflex', instructions: null, success_metric: null, practice_mode: 'deathmatch', trainer_scenario: 'not_a_drill' },
      // API category fallback in godot_config is a guess, not a drill choice
      { id: 4, category: 'utility_usage', title: 'Empress Timing', instructions: 'x', success_metric: null, practice_mode: 'custom_game', trainer_scenario: null, godot_config: { scenario: 'flick' } },
    ], label, 4)
    expect(rows[3]).toMatchObject({ meta: 'Utility · Custom game', trainerScenario: null })
    expect(rows[0]).toEqual({ id: 1, title: 'Empress Timing — Pre-Execute Only Custom Practice', meta: 'Utility · Custom game', trainerScenario: null, steps: 'Load Haven.', goal: 'Never early.', fromMatches: false, why: null, stat: null, beta: false })
    expect(rows[1]).toMatchObject({ title: 'Flick Warm-up', meta: 'Mechanics · Trainer: Flick', trainerScenario: 'flick' })
    expect(rows[2]).toMatchObject({ meta: 'Agent play · Deathmatch', trainerScenario: null })
  })
  it('adds the label, why and stat line for match-stats drills (VOD drills unchanged)', () => {
    const [stats, vod] = matchDrillRows([
      {
        id: 9, category: 'mechanics', title: 'Head-level flicks', instructions: null, success_metric: null, practice_mode: null,
        trainer_scenario: 'flick', source: 'match_stats', beta: true,
        why: ' Your headshots were 16% of 230 hits that landed across your last 5 ranked matches. ',
        stat: { label: 'HS', better: 'higher', baseline_pct: 16, current_pct: null, target_pct: 19, matches: 5 },
      },
      { id: 10, category: 'mechanics', title: 'Flick', instructions: null, success_metric: null, practice_mode: null, trainer_scenario: 'flick', source: 'vod', why: 'ignored', stat: null },
    ], label)
    expect(stats).toMatchObject({
      fromMatches: true, beta: true, trainerScenario: 'flick',
      why: 'Your headshots were 16% of 230 hits that landed across your last 5 ranked matches.',
      stat: { text: 'HS 16% → target 19%', trend: null },
    })
    expect(vod).toMatchObject({ fromMatches: false, why: null, stat: null, beta: false })
  })
  it('limits to three rows and keeps untagged titles', () => {
    expect(matchDrillRows(Array.from({ length: 5 }, (_, i) => ({ id: i, category: 'x', title: 'T', instructions: null, success_metric: null, practice_mode: null })), label)).toHaveLength(3)
    expect(cleanDrillTitle('(Hard)')).toBe('(Hard)')
  })
})

describe('practiceGameScope', () => {
  it('shows focus, match drills and calibration only for Valorant', () => {
    expect(practiceGameScope('valorant')).toEqual({ matchCoaching: true, note: null })
    for (const game of ['cs2', 'deadlock', 'lol', 'apex']) {
      const scope = practiceGameScope(game)
      expect(scope.matchCoaching).toBe(false)
      expect(scope.note).toBeTruthy()
    }
  })
  it('points shooters at their own sensitivity and is honest with League', () => {
    expect(practiceGameScope('cs2').note).toContain('CS2 sensitivity')
    expect(practiceGameScope('deadlock').note).toContain('Deadlock sensitivity')
    expect(practiceGameScope('lol').note).toContain('won’t help much in League')
  })
})

describe('pickNextDrill', () => {
  const row = (id: number, scenario: string | null = 'flick') => ({
    id, title: `Drill ${id}`, meta: '', trainerScenario: scenario, steps: 'Do it', goal: '80%', fromMatches: true, why: 'You die first', stat: null, beta: false,
  })
  it('puts the drill the match report recommended first', () => {
    const d = pickNextDrill({ drill: 'Custom game on Ascent, 10 min: clear one angle.', why: 'Opening deaths', scenario: 'angle_clearing' }, [row(1)], ['angle_clearing'])!
    expect(d).toMatchObject({ source: 'match_report', title: 'Custom game on Ascent, 10 min: clear one angle.', why: 'Opening deaths', scenario: 'angle_clearing' })
  })
  it('drops a route scenario the catalogue does not have', () => {
    expect(pickNextDrill({ drill: 'x', scenario: 'nope' }, [], ['flick'])!.scenario).toBeNull()
  })
  it('otherwise uses the top drill from matches', () => {
    expect(pickNextDrill({}, [row(7), row(8)], [])).toMatchObject({ source: 'match_drill', matchDrillId: 7, steps: 'Do it', why: 'You die first' })
  })
  it('is null with nothing to suggest', () => {
    expect(pickNextDrill({ drill: '  ' }, [], [])).toBeNull()
  })
  it('builds the Practise link from the report', () => {
    expect(practiceRouteFromReport({ text: 'Drill', why: 'Why' }, 'flick')).toEqual({ path: '/training', query: { drill: 'Drill', why: 'Why', scenario: 'flick' } })
    expect(practiceRouteFromReport(null, null)).toEqual({ path: '/training', query: {} })
  })
})
