import { describe, expect, it } from 'vitest'
import { recordingStatusBadge } from './recording-status'
import type { PendingRecording } from '../env.d.ts'

function rec(overrides: Partial<PendingRecording> = {}): PendingRecording {
  return {
    id: '1',
    path: '/tmp/a.mp4',
    game: 'valorant',
    map: 'Breeze',
    agent: 'Jett',
    gameMode: 'COMPETITIVE',
    recordedAt: Date.now(),
    analysed: false,
    hasLocalFile: true,
    cloudUploaded: false,
    ...overrides,
  } as PendingRecording
}

describe('recordingStatusBadge', () => {
  it('Analysed when analysisId set', () => {
    expect(recordingStatusBadge(rec({ analysisId: 9 })).label).toBe('Analysed')
  })

  it('Analysing / Uploading from pipelineStatus', () => {
    expect(recordingStatusBadge(rec({ pipelineStatus: 'analysing' })).label).toBe('Analysing')
    expect(recordingStatusBadge(rec({ pipelineStatus: 'uploading' })).label).toBe('Uploading')
  })

  it('Failed when lastAnalysisError', () => {
    expect(recordingStatusBadge(rec({ lastAnalysisError: 'boom' })).label).toBe('Failed')
  })

  it('Syncing for readiness sync states', () => {
    expect(
      recordingStatusBadge(
        rec({ analysisReadiness: { ready: false, state: 'syncing', message: '', duelMomentCount: 0 } }),
      ).label,
    ).toBe('Syncing')
    expect(
      recordingStatusBadge(
        rec({
          analysisReadiness: {
            ready: false,
            state: 'waiting_match_data',
            message: '',
            duelMomentCount: 0,
          },
        }),
      ).label,
    ).toBe('Syncing')
  })

  it('Paused when automatic stats sync was stopped by the user', () => {
    expect(
      recordingStatusBadge(rec({
        matchStatsSyncPaused: true,
        analysisReadiness: { ready: false, state: 'syncing', message: '', duelMomentCount: 0 },
      })).label,
    ).toBe('Paused')
  })

  it('Cloud when cloud-backed and not analysed', () => {
    expect(
      recordingStatusBadge(rec({ cloudUploaded: true, hasLocalFile: false, analysisId: undefined })).label,
    ).toBe('Cloud')
    expect(
      recordingStatusBadge(rec({ cloudUploaded: true, hasLocalFile: true, analysisId: undefined })).label,
    ).toBe('Cloud')
  })

  it('Local when on disk only', () => {
    expect(recordingStatusBadge(rec({ hasLocalFile: true, cloudUploaded: false })).label).toBe('Local')
  })
})
