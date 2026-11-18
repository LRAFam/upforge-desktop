import { afterEach, describe, expect, it } from 'vitest'
import { APP_VERSION } from './app-version'
import {
  clientVersionHeaders,
  formatTraceSection,
  lastAnalysisJob,
  noteAnalysisJob,
  resetAnalysisTraceForTests,
} from './analysis-trace'

afterEach(() => resetAnalysisTraceForTests())

describe('analysis trace ids', () => {
  it('sends the app version on API calls', () => {
    expect(clientVersionHeaders()).toEqual({ 'X-Client-Version': APP_VERSION })
  })

  it('remembers only the latest analysis job', () => {
    expect(lastAnalysisJob()).toBeNull()
    noteAnalysisJob({ jobId: 'job-a', game: 'valorant', clientRecordingId: 'rec-a' }, 1_700_000_000_000)
    noteAnalysisJob({ jobId: 'job-b', game: 'deadlock' }, 1_700_000_001_000)
    expect(lastAnalysisJob()).toEqual({ jobId: 'job-b', game: 'deadlock', clientRecordingId: null, at: 1_700_000_001_000 })
  })

  it('ignores an empty job id', () => {
    noteAnalysisJob({ jobId: '', game: 'cs2' })
    expect(lastAnalysisJob()).toBeNull()
  })

  it('formats the ids header for the support bundle', () => {
    const lines = formatTraceSection({
      userId: 42,
      version: '3.4.13',
      last: { jobId: 'job-b', game: 'valorant', clientRecordingId: 'rec-b', at: 1_700_000_001_000 },
    })
    expect(lines).toEqual([
      '=== IDS ===',
      'User id: 42',
      'App version: 3.4.13',
      'Last job id: job-b',
      'Last job game: valorant',
      'Last job started: 2023-11-14T22:13:21.000Z',
      'Client recording id: rec-b',
    ])
  })

  it('says when nothing is known instead of leaving lines out', () => {
    expect(formatTraceSection({ userId: null, version: '3.4.13', last: null })).toEqual([
      '=== IDS ===',
      'User id: not signed in',
      'App version: 3.4.13',
      'Last job id: none this session',
      'Client recording id: none',
    ])
  })
})
