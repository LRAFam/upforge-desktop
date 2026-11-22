import { describe, expect, it } from 'vitest'
import { trainerRunKey as queueRunKey } from '../../electron/main/trainer-session-queue'
import { asTrainerSyncOutcome, asTrainerUnsavedRuns, asTrainerUploadStatus, trainerRunKey, trainerRunSavedLabel, trainerRunSavedLabels, trainerSyncLine, trainerUploadStatusLine, unsavedRunReasonText, type TrainerDrillState, type TrainerSyncOutcome } from './trainer-sync'

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
    const line = trainerSyncLine(saved(drill({ completed: true, status: 'completed', next: { id: 2, title: 'Head Height (Hard)', trainer_difficulty: 'hard', pass_score: 70 } })), true)
    expect(line).toEqual({ text: 'Drill passed and recorded. Next: Hard, pass at 70.', tone: 'win' })
    expect(trainerSyncLine(saved(drill({ completed: true, status: 'completed' })), true).text).toBe('Drill passed and recorded. That was the last tier.')
  })
  it('counts attempts towards an active drill and says when it is paused', () => {
    expect(trainerSyncLine(saved(drill({ attempt_count: 2 })), true).text).toBe('Recorded towards your drill: attempt 2 of 3. Pass at 70 (1 try left).')
    // No easier version (already at Easy, or an older API): matches can assign a new drill.
    expect(trainerSyncLine(saved(drill({ attempt_count: 3, status: 'needs_reassignment' })), true).text)
      .toBe('Recorded. 3 runs below 70, so this drill is paused. Your next matches can assign a new one.')
  })
  it('a paused drill with an easier version says that version is ready, not that matches will assign one', () => {
    const paused = drill({ attempt_count: 3, status: 'needs_reassignment', next: { id: 2, title: 'Head Height (Easy)', trainer_difficulty: 'easy', pass_score: 70 } })
    expect(trainerSyncLine(saved(paused), true))
      .toEqual({ text: 'Recorded. 3 runs below 70, so this drill is paused. An easier version is ready: Easy, pass at 70.', tone: 'muted' })
    expect(trainerSyncLine(saved({ ...paused, next: { id: 2, title: null, trainer_difficulty: null, pass_score: 70 } }), true).text)
      .toBe('Recorded. 3 runs below 70, so this drill is paused. An easier version is ready: pass at 70.')
  })
  it('a trainer pass is "practice target hit", not a finished drill (newer API)', () => {
    const line = trainerSyncLine(saved(drill({ attempt_count: 2, practice_passed: true, practice_passed_at: '2026-11-16T10:00:00Z', verified: false })), true)
    expect(line).toEqual({ text: 'Recorded. Practice target hit: your next matches decide this drill.', tone: 'win' })
  })
  it('free play is only saved to history', () => {
    expect(trainerSyncLine(saved(null), false).text).toBe('Saved to your training history.')
  })
})

describe('a saved run the API did not count (unranked_reason)', () => {
  const unranked = (code: string): TrainerSyncOutcome => ({ ...saved(null), unrankedReason: code })

  it('says why in plain words', () => {
    expect(trainerSyncLine(unranked('no_hits'), true))
      .toEqual({ text: 'Saved to your training history, but it did not count towards your drill or the leaderboards: no target was hit.', tone: 'muted' })
    expect(trainerSyncLine(unranked('no_hits'), false).text).toBe('Saved to your training history, but it did not count on the leaderboards: no target was hit.')
    expect(trainerSyncLine(unranked('reaction_floor'), false).text).toMatch(/: the average reaction time is faster than a person can react\.$/)
    expect(trainerSyncLine(unranked('overlaps_run'), false).text).toMatch(/: it overlaps the time of another run you saved\.$/)
  })

  it('a reason this build does not know still says the run did not count, without the code', () => {
    const line = trainerSyncLine(unranked('some_new_check'), true).text
    expect(line).toBe('Saved to your training history, but it did not count towards your drill or the leaderboards: it did not pass UpForge’s result checks.')
    expect(line).not.toContain('some_new_check')
  })

  it('adds nothing when the API sends no reason (older API)', () => {
    expect(trainerSyncLine(saved(null), true).text).toBe('Saved to your training history. It did not count towards a drill.')
    expect(trainerSyncLine({ ...saved(null), unrankedReason: null }, false).text).toBe('Saved to your training history.')
  })
})

describe('runs that could not be saved', () => {
  it('names the reason in plain words, with the API’s own message for a refused run', () => {
    expect(unsavedRunReasonText({ reason: 'expired', message: 'Not uploaded within 7 days' })).toBe('Not uploaded within 7 days, so automatic retries stopped.')
    expect(unsavedRunReasonText({ reason: 'rejected', message: 'The selected scenario is invalid.' })).toBe('UpForge did not accept it: The selected scenario is invalid.')
    expect(unsavedRunReasonText({ reason: 'rejected', message: 'The score field must not be greater than 100' })).toBe('UpForge did not accept it: The score field must not be greater than 100.')
    // apiPost's fallback text is not a reason.
    expect(unsavedRunReasonText({ reason: 'rejected', message: 'Request failed (422)' })).toBe('UpForge did not accept it.')
    expect(unsavedRunReasonText({ reason: 'rejected', message: ' ' })).toBe('UpForge did not accept it.')
  })

  it('reads the list the main process sends, and nothing else', () => {
    const ok = { clientRunId: 'c', scenario: 'flick', completedAt: '2026-11-15T10:00:00Z', reason: 'rejected', status: 422, message: 'x', failedAt: 1 }
    expect(asTrainerUnsavedRuns([ok, { ...ok, completedAt: null, reason: 'expired', status: null }, { clientRunId: 1 }, null, { ...ok, reason: 'lost' }]))
      .toEqual([ok, { ...ok, completedAt: null, reason: 'expired', status: null }])
    expect(asTrainerUnsavedRuns(null)).toEqual([])
    expect(asTrainerUnsavedRuns({ runs: [ok] })).toEqual([])
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

  it('says when runs could not be saved (kept until they are resent, not only for a week)', () => {
    expect(trainerUploadStatusLine({ waiting: 0, unsaved: 1 })).toEqual({ text: '1 run could not be saved.', tone: 'loss' })
    expect(trainerUploadStatusLine({ waiting: 2, unsaved: 1 })).toEqual({ text: '2 runs waiting to upload. 1 run could not be saved.', tone: 'loss' })
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

describe('guided-session steps: saved or waiting', () => {
  const steps = [
    { scenario: 'flick', completed_at: '2026-11-22T18:00:00.000Z' },
    { scenario: 'tracking', completed_at: '2026-11-22T18:02:00.000Z' },
    { scenario: 'microadjust', completed_at: '2026-11-22T18:04:00.000Z' },
  ]
  const pushed = (state: TrainerSyncOutcome['state']) => Object.fromEntries(steps.map((s, i) => {
    const key = trainerRunKey(s.scenario, s.completed_at)
    return [key, { key, clientRunId: `c${i}`, state, drill: null }]
  })) as Record<string, TrainerSyncOutcome>

  it('API unreachable: each step waits and the session ends with "3 runs waiting to upload"; both clear when they land', () => {
    expect(trainerRunSavedLabels(steps, pushed('pending')).map(l => l?.text)).toEqual(['Waiting to upload', 'Waiting to upload', 'Waiting to upload'])
    expect(trainerUploadStatusLine({ waiting: 3, unsaved: 0 })?.text).toBe('3 runs waiting to upload. UpForge retries automatically.')
    // The retry lands: the queue pushes "saved" for each run and the counts drop to zero.
    expect(trainerRunSavedLabels(steps, pushed('saved')).map(l => l?.text)).toEqual(['Saved', 'Saved', 'Saved'])
    expect(trainerUploadStatusLine({ waiting: 0, unsaved: 0 })).toBeNull()
  })

  it('a refused run says "Not saved"; a step with no outcome yet is still saving; a step without a run has no label', () => {
    const refused = { ...pushed('pending'), [trainerRunKey('tracking', steps[1].completed_at)]: { key: trainerRunKey('tracking', steps[1].completed_at), clientRunId: 'c1', state: 'failed' as const, drill: null } }
    expect(trainerRunSavedLabels(steps, refused)[1]).toEqual({ text: 'Not saved', tone: 'loss' })
    expect(trainerRunSavedLabels([steps[0], undefined], {})).toEqual([{ text: 'Saving…', tone: 'muted' }, null])
  })

  it('an outcome counts only for its own run (same drill, other finish time)', () => {
    const other = trainerRunKey('flick', '2026-11-22T17:00:00.000Z')
    expect(trainerRunSavedLabels([steps[0]], { [other]: { key: other, clientRunId: 'x', state: 'saved', drill: null } })[0]?.text).toBe('Saving…')
  })

  it('uses the upload queue’s own run key', () => {
    expect(queueRunKey).toBe(trainerRunKey)
    expect(trainerRunKey('flick', '2026-11-22T18:00:00.000Z')).toBe('flick|2026-11-22T18:00:00.000Z')
  })

  it('reads the outcomes the main process sends, and nothing else', () => {
    const ok = { key: 'flick|t', clientRunId: 'c', state: 'pending', drill: null }
    expect(asTrainerSyncOutcome(ok)).toEqual(ok)
    expect(asTrainerSyncOutcome({ ...ok, state: 'lost' })).toBeNull()
    expect(asTrainerSyncOutcome({ ...ok, key: 3 })).toBeNull()
    expect(asTrainerSyncOutcome(null)).toBeNull()
    expect(asTrainerSyncOutcome('flick|t')).toBeNull()
  })
})
