import { describe, expect, it } from 'vitest'
import { asTrainerUploadStatus, trainerRunSavedLabel, trainerSyncLine, trainerUploadStatusLine, type TrainerDrillState, type TrainerSyncOutcome } from './trainer-sync'

const drill = (over: Partial<TrainerDrillState> = {}): TrainerDrillState => ({ id: 1, title: 'Head Height', status: 'active', completed: false, attempt_count: 1, attempts_allowed: 3, pass_score: 70, next: null, ...over })
const saved = (d: TrainerDrillState | null) => ({ key: 'k', clientRunId: 'c', state: 'saved' as const, drill: d })

describe('trainerSyncLine', () => {
  it('says when a run is still being saved, waiting to retry, or lost', () => {
    expect(trainerSyncLine(null, true).text).toBe('Saving this run…')
    expect(trainerSyncLine({ key: 'k', clientRunId: 'c', state: 'pending', drill: null }, true).text).toMatch(/retries automatically/)
    const unstored = trainerSyncLine({ key: 'k', clientRunId: 'c', state: 'pending', drill: null, stored: false }, true)
    expect(unstored.text).toMatch(/could not keep a copy/)
    expect(unstored.tone).toBe('loss')
    expect(trainerSyncLine({ key: 'k', clientRunId: 'c', state: 'failed', drill: null }, true)).toEqual({ text: 'This run could not be saved, so it did not count towards your drill.', tone: 'loss' })
  })
  it('names the next tier and its pass mark when the drill is passed', () => {
    const line = trainerSyncLine(saved(drill({ completed: true, status: 'completed', next: { id: 2, title: 'Head Height (Hard)', trainer_difficulty: 'hard', pass_score: 70 } })), true, 10)
    expect(line).toEqual({ text: 'Drill passed and recorded. Next: Hard, pass at 700.', tone: 'win' })
    expect(trainerSyncLine(saved(drill({ completed: true, status: 'completed' })), true).text).toBe('Drill passed and recorded. That was the last tier.')
  })
  it('counts attempts towards an active drill and says when it is paused', () => {
    expect(trainerSyncLine(saved(drill({ attempt_count: 2 })), true).text).toBe('Recorded towards your drill: attempt 2 of 3. Pass at 70 (1 try left).')
    // No easier version (already at Easy, or an older API): matches can assign a new drill.
    expect(trainerSyncLine(saved(drill({ attempt_count: 3, status: 'needs_reassignment' })), true, 10).text)
      .toBe('Recorded. 3 runs below 700, so this drill is paused. Your next matches can assign a new one.')
  })
  it('a paused drill with an easier version says that version is ready, not that matches will assign one', () => {
    const paused = drill({ attempt_count: 3, status: 'needs_reassignment', next: { id: 2, title: 'Head Height (Easy)', trainer_difficulty: 'easy', pass_score: 70 } })
    expect(trainerSyncLine(saved(paused), true, 10))
      .toEqual({ text: 'Recorded. 3 runs below 700, so this drill is paused. An easier version is ready: Easy, pass at 700.', tone: 'muted' })
    expect(trainerSyncLine(saved({ ...paused, next: { id: 2, title: null, trainer_difficulty: null, pass_score: 70 } }), true, 10).text)
      .toBe('Recorded. 3 runs below 700, so this drill is paused. An easier version is ready: pass at 700.')
  })
  it('a trainer pass is "practice target hit", not a finished drill (newer API)', () => {
    const line = trainerSyncLine(saved(drill({ attempt_count: 2, practice_passed: true, practice_passed_at: '2026-11-16T10:00:00Z', verified: false })), true)
    expect(line).toEqual({ text: 'Recorded. Practice target hit: your next matches decide this drill.', tone: 'win' })
  })
  it('free play is only saved to history', () => {
    expect(trainerSyncLine(saved(null), false).text).toBe('Saved to your training history.')
  })
})

describe('runs waiting to upload', () => {
  const outcome = (state: TrainerSyncOutcome['state']): TrainerSyncOutcome => ({ key: 'k', clientRunId: 'c', state, drill: null })

  it('says how many runs are waiting, and nothing once they land', () => {
    expect(trainerUploadStatusLine({ waiting: 3, unsaved: 0 })).toEqual({ text: '3 runs waiting to upload. UpForge retries automatically.', tone: 'muted' })
    expect(trainerUploadStatusLine({ waiting: 1, unsaved: 0 })?.text).toBe('1 run waiting to upload. UpForge retries automatically.')
    expect(trainerUploadStatusLine({ waiting: 0, unsaved: 0 })).toBeNull()
    expect(trainerUploadStatusLine(null)).toBeNull()
  })

  it('says when runs this week could not be saved', () => {
    expect(trainerUploadStatusLine({ waiting: 0, unsaved: 1 })).toEqual({ text: '1 run from this week could not be saved.', tone: 'loss' })
    expect(trainerUploadStatusLine({ waiting: 2, unsaved: 1 })).toEqual({ text: '2 runs waiting to upload. 1 run from this week could not be saved.', tone: 'loss' })
  })

  it('on a result screen, counts only the other runs', () => {
    // The run on screen is still being sent or retried: its own line already says so.
    expect(trainerUploadStatusLine({ waiting: 1, unsaved: 0 }, null)).toBeNull()
    expect(trainerUploadStatusLine({ waiting: 3, unsaved: 0 }, outcome('pending'))?.text).toBe('2 other runs waiting to upload. UpForge retries automatically.')
    expect(trainerUploadStatusLine({ waiting: 2, unsaved: 0 }, outcome('saved'))?.text).toBe('2 other runs waiting to upload. UpForge retries automatically.')
    expect(trainerUploadStatusLine({ waiting: 0, unsaved: 1 }, outcome('failed'))).toBeNull()
  })

  it('marks each run in a list as saved, waiting or not saved', () => {
    expect(trainerRunSavedLabel(null)).toEqual({ text: 'Saving…', tone: 'muted' })
    expect(trainerRunSavedLabel(outcome('saved'))).toEqual({ text: 'Saved', tone: 'muted' })
    expect(trainerRunSavedLabel(outcome('pending'))).toEqual({ text: 'Waiting to upload', tone: 'muted' })
    expect(trainerRunSavedLabel(outcome('failed'))).toEqual({ text: 'Not saved', tone: 'loss' })
  })

  it('reads the status the main process sends, and nothing else', () => {
    expect(asTrainerUploadStatus({ waiting: 2, unsaved: 1 })).toEqual({ waiting: 2, unsaved: 1 })
    expect(asTrainerUploadStatus({ waiting: '2' })).toBeNull()
    expect(asTrainerUploadStatus(null)).toBeNull()
  })
})
