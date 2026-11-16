import { describe, expect, it } from 'vitest'
import { trainerSyncLine, type TrainerDrillState } from './trainer-sync'

const drill = (over: Partial<TrainerDrillState> = {}): TrainerDrillState => ({ id: 1, title: 'Head Height', status: 'active', completed: false, attempt_count: 1, attempts_allowed: 3, pass_score: 70, next: null, ...over })
const saved = (d: TrainerDrillState | null) => ({ key: 'k', clientRunId: 'c', state: 'saved' as const, drill: d })

describe('trainerSyncLine', () => {
  it('says when a run is still being saved, waiting to retry, or lost', () => {
    expect(trainerSyncLine(null, true).text).toBe('Saving this run…')
    expect(trainerSyncLine({ key: 'k', clientRunId: 'c', state: 'pending', drill: null }, true).text).toMatch(/retries automatically/)
    expect(trainerSyncLine({ key: 'k', clientRunId: 'c', state: 'failed', drill: null }, true)).toEqual({ text: 'This run could not be saved, so it did not count towards your drill.', tone: 'loss' })
  })
  it('names the next tier and its pass mark when the drill is passed', () => {
    const line = trainerSyncLine(saved(drill({ completed: true, status: 'completed', next: { id: 2, title: 'Head Height (Hard)', trainer_difficulty: 'hard', pass_score: 70 } })), true, 10)
    expect(line).toEqual({ text: 'Drill passed and recorded. Next: Hard, pass at 700.', tone: 'win' })
    expect(trainerSyncLine(saved(drill({ completed: true, status: 'completed' })), true).text).toBe('Drill passed and recorded. That was the last tier.')
  })
  it('counts attempts towards an active drill and says when it closes', () => {
    expect(trainerSyncLine(saved(drill({ attempt_count: 2 })), true).text).toBe('Recorded towards your drill: attempt 2 of 3. Pass at 70 (1 try left).')
    expect(trainerSyncLine(saved(drill({ attempt_count: 3, status: 'needs_reassignment' })), true).text).toMatch(/^Recorded\. 3 runs below 70, so this drill is closed/)
  })
  it('a trainer pass is "practice target hit", not a finished drill (newer API)', () => {
    const line = trainerSyncLine(saved(drill({ attempt_count: 2, practice_passed: true, practice_passed_at: '2026-11-16T10:00:00Z', verified: false })), true)
    expect(line).toEqual({ text: 'Recorded. Practice target hit: your next matches decide this drill.', tone: 'win' })
  })
  it('free play is only saved to history', () => {
    expect(trainerSyncLine(saved(null), false).text).toBe('Saved to your training history.')
  })
})
