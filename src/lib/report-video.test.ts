import { describe, expect, it } from 'vitest'
import {
  firstReportView, pickReportRecording, reportAllowanceLabel, reportVideoAction, reportVideoCopy, reportWatchQuery,
  type ReportRecording,
} from './report-video'

const READY = { ready: true, state: 'ready' as const, message: '', duelMomentCount: 6 }
function rec(over: Partial<ReportRecording> = {}): ReportRecording {
  return { id: 'rec-1', matchId: 'match-1', hasLocalFile: true, analysisReadiness: READY, ...over }
}

describe('pickReportRecording', () => {
  it('finds the recording of this match and ignores other matches', () => {
    const rows = [rec({ id: 'other', matchId: 'match-2' }), rec({ id: 'mine' })]
    expect(pickReportRecording(rows, 'match-1')?.id).toBe('mine')
    expect(pickReportRecording(rows, 'match-9')).toBeNull()
    expect(pickReportRecording(rows, '')).toBeNull()
  })

  it('prefers the analysed row, then one in progress, then one with the file on this PC', () => {
    const gone = rec({ id: 'gone', hasLocalFile: false })
    const local = rec({ id: 'local' })
    const uploading = rec({ id: 'uploading', pipelineStatus: 'uploading' })
    const analysed = rec({ id: 'analysed', hasLocalFile: false, analysisId: 7 })
    expect(pickReportRecording([gone, local, uploading, analysed], 'match-1')?.id).toBe('analysed')
    expect(pickReportRecording([gone, local, uploading], 'match-1')?.id).toBe('uploading')
    expect(pickReportRecording([gone, local], 'match-1')?.id).toBe('local')
    expect(pickReportRecording([gone], 'match-1')?.id).toBe('gone')
  })

  it('never picks a clips-only capture or a read-only developer fixture', () => {
    const fixture = rec({ id: 'fx', productionFixture: { source: 'production_archive', readOnly: true, analysisState: 'analysed', missingFields: [] } })
    expect(pickReportRecording([rec({ id: 'clips', clipsOnly: true }), fixture], 'match-1')).toBeNull()
  })
})

describe('reportVideoAction', () => {
  it('offers nothing when the match was not recorded or cannot be played', () => {
    expect(reportVideoAction(null, { quotaLeft: true })).toEqual({ kind: 'none' })
    expect(reportVideoAction(rec({ clipsOnly: true }), { quotaLeft: true })).toEqual({ kind: 'none' })
    // Recorded once, but the file is gone and nothing was uploaded.
    expect(reportVideoAction(rec({ hasLocalFile: false }), { quotaLeft: true })).toEqual({ kind: 'none' })
  })

  it('opens the existing video coaching once the match was analysed', () => {
    expect(reportVideoAction(rec({ analysisId: 42 }), { quotaLeft: false })).toEqual({ kind: 'open', analysisId: 42 })
  })

  it('shows progress while the match is uploading or being analysed', () => {
    expect(reportVideoAction(rec({ pipelineStatus: 'uploading' }), { quotaLeft: true }).kind).toBe('working')
    expect(reportVideoAction(rec({ pipelineStatus: 'analysing' }), { quotaLeft: true }).kind).toBe('working')
  })

  it('waits when the upload is paused for a live match', () => {
    const action = reportVideoAction(rec({ pipelineStatus: 'pending', pipelineDeferReason: 'recording' }), { quotaLeft: true })
    expect(action.kind).toBe('waiting')
  })

  it('never offers a recording the app says is not ready, and repeats its reason', () => {
    const message = 'Still getting Riot match data. Analyse unlocks when ready (usually about a minute). Keep Valorant / Riot Client open.'
    const action = reportVideoAction(
      rec({ analysisReadiness: { ready: false, state: 'syncing', message, duelMomentCount: 0 } }),
      { quotaLeft: true },
    )
    expect(action).toEqual({ kind: 'waiting', text: message })
    const unsupported = reportVideoAction(
      rec({ analysisReadiness: { ready: false, state: 'mode_unsupported', message: 'Duel coaching is not available for Deathmatch or Team Deathmatch', duelMomentCount: 0 } }),
      { quotaLeft: true },
    )
    expect(unsupported).toEqual({ kind: 'waiting', text: 'Duel coaching is not available for Deathmatch or Team Deathmatch' })
    // No readiness on the row at all is not "ready": same rule as the Matches screen.
    expect(reportVideoAction(rec({ analysisReadiness: undefined }), { quotaLeft: true }).kind).toBe('waiting')
  })

  it('points to plans when the plan has no analyses left', () => {
    expect(reportVideoAction(rec(), { quotaLeft: false })).toEqual({ kind: 'upgrade' })
  })

  it('starts when the recording is ready, also while the plan is still unknown', () => {
    expect(reportVideoAction(rec(), { quotaLeft: true })).toEqual({ kind: 'start', recordingId: 'rec-1', retry: false })
    expect(reportVideoAction(rec(), { quotaLeft: null })).toEqual({ kind: 'start', recordingId: 'rec-1', retry: false })
  })

  it('retries a failed attempt that already reached the cloud, even without the local file', () => {
    const failed = rec({ hasLocalFile: false, jobId: 'job-9', lastAnalysisError: 'Analysis failed', analysisReadiness: undefined })
    expect(reportVideoAction(failed, { quotaLeft: true })).toEqual({ kind: 'start', recordingId: 'rec-1', retry: true })
  })

  it('holds "sending" right after the player pressed, instead of offering the button or plans again', () => {
    expect(reportVideoAction(rec(), { quotaLeft: true, justStarted: true }).kind).toBe('working')
    // The analysis just taken was the plan's last one: still no "See plans" while it is being sent.
    expect(reportVideoAction(rec(), { quotaLeft: false, justStarted: true }).kind).toBe('working')
    // Once the recording reports a failure, the retry is offered again.
    const failed = rec({ jobId: 'job-9', lastAnalysisError: 'Analysis failed' })
    expect(reportVideoAction(failed, { quotaLeft: true, justStarted: true })).toEqual({ kind: 'start', recordingId: 'rec-1', retry: true })
  })
})

describe('reportVideoCopy', () => {
  it('has no block when there is nothing to offer', () => {
    expect(reportVideoCopy({ kind: 'none' })).toBeNull()
  })

  it('says it uploads the match, what it costs and what is left on the plan', () => {
    const copy = reportVideoCopy({ kind: 'start', recordingId: 'rec-1', retry: false }, '1 analysis left')
    expect(copy?.button).toBe('Get video coaching')
    expect(copy?.text).toContain('Upload it')
    expect(copy?.text).toContain('Uses 1 analysis (1 analysis left).')
    expect(reportVideoCopy({ kind: 'start', recordingId: 'rec-1', retry: false })?.text).toContain('Uses 1 analysis.')
  })

  it('has no button while working or waiting', () => {
    expect(reportVideoCopy({ kind: 'working', text: 'Uploading…' })).toEqual({ text: 'Uploading…', button: null })
    expect(reportVideoCopy({ kind: 'waiting', text: 'Not yet' })).toEqual({ text: 'Not yet', button: null })
  })

  it('labels the open, retry and plan actions', () => {
    expect(reportVideoCopy({ kind: 'open', analysisId: 1 })?.button).toBe('Open video coaching')
    expect(reportVideoCopy({ kind: 'start', recordingId: 'rec-1', retry: true })?.button).toBe('Try again')
    expect(reportVideoCopy({ kind: 'upgrade' })?.button).toBe('See plans')
  })
})

describe('reportAllowanceLabel', () => {
  it('counts what is left of the plan allowance', () => {
    expect(reportAllowanceLabel({ total: 0, limit: 1 })).toBe('1 analysis left')
    expect(reportAllowanceLabel({ total: 2, limit: 10 })).toBe('8 analyses left')
  })

  it('says nothing when it would mislead: unknown, no cap, or only bought credits remain', () => {
    expect(reportAllowanceLabel(null)).toBeNull()
    expect(reportAllowanceLabel({ total: 3, limit: null })).toBeNull()
    expect(reportAllowanceLabel({ total: 1, limit: 1 })).toBeNull()
    expect(reportAllowanceLabel({ total: 0, limit: 1_000_000 })).toBeNull()
  })
})

describe('firstReportView', () => {
  it('is true once per match and game in an app session', () => {
    expect(firstReportView('valorant', 'm-first')).toBe(true)
    expect(firstReportView('valorant', 'm-first')).toBe(false)
    expect(firstReportView('lol', 'm-first')).toBe(true)
    expect(firstReportView('valorant', '')).toBe(false)
  })
})

describe('reportWatchQuery', () => {
  it('opens the recording at the round shown in the report (1-based)', () => {
    expect(reportWatchQuery(rec(), 6)).toEqual({ id: 'rec-1', round: '6' })
  })

  it('opens the analysed match when there is one, like the post-game link', () => {
    expect(reportWatchQuery(rec({ analysisId: 42 }), 3)).toEqual({ timelineId: '42', round: '3' })
  })

  it('falls back to the cloud copy when the file is no longer on this PC', () => {
    expect(reportWatchQuery(rec({ hasLocalFile: false, archiveId: 'arc-7' }), 12)).toEqual({ archiveId: 'arc-7', round: '12' })
  })

  it('returns null when there is nothing to play or the round is not usable', () => {
    expect(reportWatchQuery(null, 3)).toBeNull()
    expect(reportWatchQuery(rec({ clipsOnly: true }), 3)).toBeNull()
    expect(reportWatchQuery(rec({ hasLocalFile: false }), 3)).toBeNull()
    expect(reportWatchQuery(rec(), 0)).toBeNull()
    expect(reportWatchQuery(rec(), 2.5)).toBeNull()
    expect(reportWatchQuery(rec(), 99)).toBeNull()
  })
})
