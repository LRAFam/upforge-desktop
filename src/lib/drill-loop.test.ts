import { describe, expect, it } from 'vitest'
import { drillLoop, type DrillLoopSource } from './drill-loop'
import type { TrainerDrillState } from './trainer-sync'

const statDrill = (over: Partial<DrillLoopSource> = {}): DrillLoopSource => ({
  id: 7,
  title: 'Head Height',
  status: 'active',
  source: 'match_stats',
  why: 'Only 16% of your hits were headshots over your last 8 ranked games.',
  stat: { label: 'HS', better: 'higher', baseline_pct: 16, current_pct: 17, target_pct: 19, matches: 8 },
  ...over,
})
const state = (over: Partial<TrainerDrillState> = {}): TrainerDrillState => ({
  id: 7, title: 'Head Height', status: 'active', completed: false, attempt_count: 1, attempts_allowed: 3, pass_score: 70, next: null, ...over,
})

describe('drillLoop', () => {
  it('is null for free play', () => {
    expect(drillLoop(null, null)).toBeNull()
  })

  it('shows why, the stat and what the next ranked games check', () => {
    const loop = drillLoop(statDrill(), state())!
    expect(loop.why).toBe('Only 16% of your hits were headshots over your last 8 ranked games.')
    expect(loop.stat).toBe('HS 16% → target 19% · now 17%')
    expect(loop.next).toBe('Your next ranked games check HS 16% → target 19%.')
  })

  it('practising: target not hit yet, with the pass mark on the 0–100 scale the run is shown on', () => {
    expect(drillLoop(statDrill(), state())!.state).toEqual({
      key: 'practising', label: 'Practice target not hit yet', text: 'Score 70 or more to hit the practice target.',
    })
  })

  it('practice target hit: still active, waiting for matches', () => {
    const loop = drillLoop(statDrill(), state({ practice_passed: true, practice_passed_at: '2026-11-16T10:00:00Z', verified: false }))!
    expect(loop.state.key).toBe('practice_target_hit')
    expect(loop.state.label).toBe('Practice target hit · waiting for matches')
    expect(loop.next).toMatch(/^Your next ranked games check/)
  })

  it('practice target hit is read from the drill row when the run is still uploading', () => {
    expect(drillLoop(statDrill({ practice_passed_at: '2026-11-16T10:00:00Z' }), null)!.state.key).toBe('practice_target_hit')
  })

  it('verified only from match evidence, with nothing left to check', () => {
    const loop = drillLoop(statDrill({ status: 'completed' }), state({ status: 'completed', practice_passed: true, verified: true, verified_by: 'match_stats' }))!
    expect(loop.state).toMatchObject({ key: 'verified', label: 'Verified in your matches' })
    expect(loop.next).toBeNull()
    expect(drillLoop({ id: 1, status: 'completed', verified_at: '2026-11-10T00:00:00Z', verified_by: 'video_score' }, null)!.state.text)
      .toMatch(/later match review/)
  })

  it('older API: a trainer pass that completed the drill is "Drill passed", never "verified in matches"', () => {
    const old = drillLoop(null, state({ status: 'completed', completed: true }))!
    expect(old.state).toMatchObject({ key: 'passed_legacy', label: 'Drill passed' })
    expect(old.next).toBeNull()
    // Older verified row with no verified_by.
    expect(drillLoop({ id: 1, status: 'completed', verified_at: '2026-10-01T00:00:00Z' }, null)!.state.key).toBe('passed_legacy')
  })

  it('paused after the allowed tries below target', () => {
    const loop = drillLoop(statDrill(), state({ status: 'needs_reassignment', attempt_count: 3 }))!
    expect(loop.state).toEqual({ key: 'paused', label: 'Paused', text: 'Paused after 3 tries below the target. Your next matches can assign a new drill.' })
    expect(loop.next).toBeNull()
  })

  it('paused with an easier version assigned: says that version is ready', () => {
    const loop = drillLoop(statDrill(), state({ status: 'needs_reassignment', attempt_count: 3,
      next: { id: 8, title: 'Head Height (Easy)', trainer_difficulty: 'easy', pass_score: 70 } }))!
    expect(loop.state).toEqual({ key: 'paused', label: 'Paused', text: 'Paused after 3 tries below the target. An easier version (Easy) is ready.' })
    expect(loop.next).toBeNull()
  })

  it('a self-reported done drill is "Marked done"', () => {
    expect(drillLoop({ id: 1, status: 'completed' }, null)!.state.label).toBe('Marked done')
  })

  it('video drills: why from the review, next check from its success metric', () => {
    const loop = drillLoop({ id: 3, title: 'Pre-aim head height', status: 'active', source: 'vod', success_metric: 'Headshot rate above 25%' }, null)!
    expect(loop.why).toBe('Assigned from your match review: Pre-aim head height.')
    expect(loop.stat).toBeNull()
    expect(loop.next).toBe('Your next analysed match checks: Headshot rate above 25%')
  })

  it('video drills: the review reason from the API when it sends one', () => {
    const loop = drillLoop({ id: 4, title: 'Pre-aim head height', status: 'active', source: 'vod', why: ' At 4:12 your crosshair sat at body height. ' }, null)!
    expect(loop.why).toBe('At 4:12 your crosshair sat at body height.')
  })
})
