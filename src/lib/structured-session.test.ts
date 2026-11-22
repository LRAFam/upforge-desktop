import { describe, expect, it } from 'vitest'
import { applyProgressionToDrill, buildStructuredSessionPlan, coachingDrillToSessionDrill, type CoachingDrillLike, type SessionDrill } from './structured-session'
import { buildWeeklyFocusPlan } from './weekly-focus'
import { currentScoringVersion } from './training-result-metrics'

const drill = (over: Partial<CoachingDrillLike>): CoachingDrillLike => ({
  id: 1, category: 'mechanics', title: 'Drill', baseline_score: 5, ...over,
})

describe('step-up from recent runs', () => {
  // GET /api/training/sessions rows, newest first.
  const run = (score: number, difficulty: string, duration_seconds = 60, scoring_version = currentScoringVersion('head_height')) =>
    ({ scenario: 'head_height', score, duration_seconds, metadata: { difficulty, scoring_version } })
  // The /api/drills row the API assigns after three Medium runs below the drill's pass mark: the same drill one step easier.
  const easyCopy = coachingDrillToSessionDrill(drill({ id: 2, category: 'crosshair_placement', title: 'Test where your crosshair sits (Easy)',
    trainer_scenario: 'head_height', trainer_difficulty: 'easy', trainer_duration_seconds: 60 })) as SessionDrill

  it('the easier drill after three near misses at Medium launches at its own difficulty', () => {
    expect(applyProgressionToDrill(easyCopy, [run(66, 'medium'), run(68, 'medium'), run(67, 'medium')]).difficulty).toBe('easy')
  })

  it('steps up only after the last three runs at the drill’s own difficulty and length scored 65+', () => {
    expect(applyProgressionToDrill(easyCopy, [run(70, 'easy'), run(66, 'easy'), run(80, 'easy')]).difficulty).toBe('medium')
    // Warm-ups (Easy, 30 s) are not runs of a 60 s drill.
    expect(applyProgressionToDrill(easyCopy, [run(90, 'easy', 30), run(90, 'easy', 30), run(90, 'easy', 30)]).difficulty).toBe('easy')
    // A run at another tier neither helps nor hides a miss at this one.
    expect(applyProgressionToDrill(easyCopy, [run(90, 'hard'), run(70, 'easy'), run(66, 'easy'), run(60, 'easy')]).difficulty).toBe('easy')
    expect(applyProgressionToDrill(easyCopy, [run(40, 'medium'), run(70, 'easy'), run(66, 'easy'), run(80, 'easy')]).difficulty).toBe('medium')
    // Fewer than three runs at this tier: no step-up.
    expect(applyProgressionToDrill(easyCopy, [run(90, 'easy'), run(90, 'easy'), run(90, 'medium')]).difficulty).toBe('easy')
    // Runs scored by older rules than this app's trainer uses say nothing about the level today.
    expect(applyProgressionToDrill(easyCopy, [run(90, 'easy', 60, 3), run(90, 'easy', 60, 3), run(90, 'easy', 60, 3)]).difficulty).toBe('easy')
    expect(applyProgressionToDrill(easyCopy, [run(90, 'easy'), run(90, 'easy', 60, 3), run(90, 'easy'), run(90, 'easy')]).difficulty).toBe('medium')
  })

  it('an assigned drill starts at its own difficulty, like the API plan, even when its review score is high', () => {
    // A video drill keeps its review score (8) when the API assigns the easier copy; that score must not lift it back.
    const videoCopy = coachingDrillToSessionDrill(drill({ id: 3, category: 'crosshair_placement', title: 'Pre-aim head height (Easy)',
      baseline_score: 8, trainer_scenario: 'head_height', trainer_difficulty: 'easy', trainer_duration_seconds: 60 })) as SessionDrill
    expect(applyProgressionToDrill(videoCopy, []).difficulty).toBe('easy')
    // A drill with no assignment behind it still starts at its score's tier.
    expect(applyProgressionToDrill({ ...videoCopy, user_drill_id: undefined }, []).difficulty).toBe('medium')
  })
})

describe('coachingDrillToSessionDrill', () => {
  it('skips drills the aim trainer cannot train', () => {
    expect(coachingDrillToSessionDrill(drill({ category: 'utility_usage', godot_config: null }))).toBeNull()
    expect(coachingDrillToSessionDrill(drill({ category: 'economy' }))).toBeNull()
    expect(coachingDrillToSessionDrill(drill({ category: 'communication', godot_config: { scenario: 'flick' } }))).toBeNull()
  })
  it('builds a session drill for aim categories and explicit scenarios', () => {
    expect(coachingDrillToSessionDrill(drill({ category: 'crosshair_placement' }))).toBeNull()
    expect(coachingDrillToSessionDrill(drill({ category: 'crosshair_placement', godot_config: { scenario: 'head_height' } }))).toMatchObject({ scenario: 'head_height', user_drill_id: 1 })
    expect(coachingDrillToSessionDrill(drill({ category: 'utility_usage', trainer_scenario: 'tracking' }))?.scenario).toBe('tracking')
  })
  it('guided session from coaching drills contains only trainable ones', () => {
    const drills = [drill({ id: 1, category: 'utility_usage' }), drill({ id: 2, category: 'positioning', godot_config: { scenario: 'duel' } })]
    const focus = drills.map(coachingDrillToSessionDrill).find(d => d !== null) ?? null
    const plan = buildStructuredSessionPlan({ focusDrill: focus })
    expect(plan.find(s => s.phase === 'focus')).toMatchObject({ scenario: 'duel', user_drill_id: 2 })
    expect(plan.some(s => s.user_drill_id === 1)).toBe(false)
  })
})

describe('weekly focus', () => {
  it('never guesses a trainer drill from the goal text', () => {
    for (const [category, text] of [['utility', 'Use utility before you peek'], ['positioning', 'Stop wide peeking'], ['economy', 'Work on economy']]) {
      const plan = buildWeeklyFocusPlan({ playstyleFocus: [{ category, text, severity: 'high' }] })
      expect(plan?.goal).toBe(text)
      expect(plan).not.toHaveProperty('drill')
    }
  })
})
