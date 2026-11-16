import { describe, expect, it } from 'vitest'
import {
  cleanDrillTitle,
  drillsForGame,
  planForGame,
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
    expect(practiceGameScope('valorant')).toEqual({ matchCoaching: true, aimTrainer: true, note: null })
    for (const game of ['cs2', 'deadlock', 'lol', 'apex']) {
      const scope = practiceGameScope(game)
      expect(scope.matchCoaching).toBe(false)
      expect(scope.note).toBeTruthy()
    }
  })
  it('points shooters at their own sensitivity and is honest with League', () => {
    expect(practiceGameScope('cs2').note).toContain('CS2 sensitivity')
    expect(practiceGameScope('deadlock').note).toContain('Deadlock sensitivity')
    expect(practiceGameScope('lol').note).toContain('League has no practice session')
  })
  it('offers the aim trainer to shooters only (League: no session, library behind a link)', () => {
    for (const game of ['valorant', 'cs2', 'deadlock', null, undefined]) expect(practiceGameScope(game).aimTrainer).toBe(true)
    expect(practiceGameScope('lol').aimTrainer).toBe(false)
  })
})

describe('drillsForGame', () => {
  const rows = [{ id: 1, game: 'valorant' }, { id: 2, game: 'cs2' }, { id: 3 }, { id: 4, game: null }]
  it('keeps only the current game, plus rows from older APIs without a game', () => {
    expect(drillsForGame(rows, 'cs2').map(r => r.id)).toEqual([2, 3, 4])
    expect(drillsForGame(rows, 'lol').map(r => r.id)).toEqual([3, 4])
  })
  it('keeps every row when the game is not known', () => {
    expect(drillsForGame(rows, null).map(r => r.id)).toEqual([1, 2, 3, 4])
  })
})

describe('planForGame', () => {
  const plan = { focus: { reason: 'x' } }
  it('drops any plan for League, also a Valorant plan from an older API', () => {
    expect(planForGame(plan, 'lol')).toBeNull()
    expect(planForGame(null, 'lol')).toBeNull()
  })
  it('keeps the plan for shooters', () => {
    expect(planForGame(plan, 'cs2')).toBe(plan)
    expect(planForGame(undefined, 'valorant')).toBeNull()
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

// ── Redesign (Nov 2026): tabs, the routine line, drills grouped by job, bars of focus checks ──
import { PRACTICE_TABS, focusBars, groupDrills, practiceOwnsTab, routineFromDrills, routineFromSession, WARM_UP_SCENARIOS } from './practice-v3'

describe('practice tabs', () => {
  it('keeps the ids other code switches on and names them for the player', () => {
    expect(PRACTICE_TABS.map(t => t.id)).toEqual(['train', 'drills', 'analytics', 'leaderboards', 'loadouts'])
    expect(PRACTICE_TABS.map(t => t.label)).toEqual(['Today', 'Drills', 'Results', 'Leaderboards', 'Setup'])
  })

  it('the screen draws Today and Drills itself; the view draws the rest', () => {
    expect(PRACTICE_TABS.filter(t => practiceOwnsTab(t.id)).map(t => t.id)).toEqual(['train', 'drills'])
  })
})

describe('the routine line', () => {
  const label = (k: string) => ({ microflick: 'Micro Flick', head_height: 'Head Height Corridor' }[k] ?? k)

  it('uses the plan\u2019s own phase names and marks the focus step', () => {
    const steps = routineFromSession([
      { phase: 'warmup', phaseLabel: 'Warm-up', scenario: 'microflick', duration_seconds: 60 },
      { phase: 'focus', phaseLabel: 'Focus', scenario: 'head_height', duration_seconds: 120 },
      { phase: 'cooldown', phaseLabel: 'Cool-down', scenario: 'strafe_track', duration_seconds: 45 },
    ], label)
    expect(steps).toEqual([
      { scenario: 'microflick', caption: 'Warm-up · 1 min', label: 'Micro Flick', focus: false },
      { scenario: 'head_height', caption: 'Focus · 2 min', label: 'Head Height Corridor', focus: true },
      { scenario: 'strafe_track', caption: 'Cool-down · 45 s', label: 'strafe_track', focus: false },
    ])
  })

  it('a step without a phase is never the focus', () => {
    expect(routineFromSession([{ phaseLabel: 'Warm-up', scenario: 'microflick', duration_seconds: 60 }], label)[0].focus).toBe(false)
  })

  it('for a focus with no plan, its first drill is the point', () => {
    const steps = routineFromDrills([
      { scenario: 'head_height', label: 'Head Height Corridor', durationSeconds: 60 },
      { scenario: 'flick', label: 'Flick', durationSeconds: 30 },
    ])
    expect(steps.map(s => [s.label, s.caption, s.focus])).toEqual([['Head Height Corridor', '1 min', true], ['Flick', '30 s', false]])
    expect(routineFromDrills([])).toEqual([])
  })
})

describe('drills grouped by what they are for', () => {
  const d = (scenario: string, beta = false) => ({ scenario, beta })
  const all = [d('flick'), d('gridshot'), d('microflick'), d('head_height'), d('strafe_track'), d('jiggle_peek', true), d('hold_angle', true), d('switching')]

  it('puts every drill in exactly one group, in reading order', () => {
    const groups = groupDrills(all, ['head_height'])
    expect(groups.map(g => g.id)).toEqual(['yours', 'warmup', 'beta', 'more'])
    expect(groups.map(g => g.drills.map(x => x.scenario))).toEqual([
      ['head_height'],
      ['microflick', 'strafe_track', 'gridshot'],
      ['jiggle_peek', 'hold_angle'],
      ['flick', 'switching'],
    ])
    expect(groups.flatMap(g => g.drills).length).toBe(all.length)
  })

  it('a warm-up or beta drill picked for the player shows under Your drill only, in the order picked', () => {
    const groups = groupDrills(all, ['jiggle_peek', 'microflick'])
    expect(groups[0].drills.map(x => x.scenario)).toEqual(['jiggle_peek', 'microflick'])
    expect(groups.find(g => g.id === 'warmup')!.drills.map(x => x.scenario)).toEqual(['strafe_track', 'gridshot'])
    expect(groups.find(g => g.id === 'beta')!.drills.map(x => x.scenario)).toEqual(['hold_angle'])
  })

  it('keeps an empty Your drill group (the screen says why) and drops other empty groups', () => {
    const groups = groupDrills([d('flick')], [])
    expect(groups.map(g => [g.id, g.drills.length])).toEqual([['yours', 0], ['more', 1]])
  })

  it('ignores picked drills that are not in the catalogue', () => {
    expect(groupDrills(all, ['not_a_drill'])[0].drills).toEqual([])
    expect(WARM_UP_SCENARIOS).toEqual(['microflick', 'strafe_track', 'gridshot'])
  })
})

describe('bars of matches checked against the focus', () => {
  const focus = (checks: Array<[number, boolean]>, baseline = 0.4, target = 0.3) => ({ baseline, target, checks: checks.map(([value, hit]) => ({ value, hit })) })

  it('draws one bar per checked match on one scale with the starting point and the target', () => {
    const c = focusBars(focus([[0.5, false], [0.25, true], [0.3, true]]))!
    expect(c.bars.map(b => b.hit)).toEqual([false, true, true])
    expect(c.bars.map(b => +b.height.toFixed(3))).toEqual([1, 0.5, 0.6])
    expect([+c.baseline.toFixed(3), +c.target.toFixed(3)]).toEqual([0.8, 0.6])
  })

  it('scales to the starting point when every match is under it', () => {
    const c = focusBars(focus([[0.2, true]], 0.4, 0.3))!
    expect(c.baseline).toBe(1)
    expect(c.bars[0].height).toBe(0.5)
  })

  it('keeps the newest matches when there are more than fit', () => {
    const many = Array.from({ length: 20 }, (_, i) => [0.1 + i * 0.01, false] as [number, boolean])
    const c = focusBars(focus(many))!
    expect(c.bars.length).toBe(12)
    expect(c.bars[c.bars.length - 1].value).toBeCloseTo(0.29)
  })

  it('shows nothing rather than a guess', () => {
    expect(focusBars(null)).toBeNull()
    expect(focusBars(focus([]))).toBeNull()
    expect(focusBars(focus([[Number.NaN, false]]))).toBeNull()
    expect(focusBars({ baseline: Number.NaN, target: 0.3, checks: [{ value: 0.2, hit: true }] })).toBeNull()
    expect(focusBars(focus([[0, true]], 0, 0))).toBeNull()
  })
})
