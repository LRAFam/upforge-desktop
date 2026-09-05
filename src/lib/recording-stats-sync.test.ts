import { describe, expect, it } from 'vitest'
import { isRecordingStatsSyncActive } from './recording-stats-sync'

describe('isRecordingStatsSyncActive', () => {
  it('does not mistake an uncached file probe for Riot stats syncing', () => {
    expect(isRecordingStatsSyncActive({ analysisReadiness: {
      ready: false, state: 'finalizing', message: 'Finalizing recording…', duelMomentCount: 0,
    } })).toBe(false)
  })

  it('does not show failed or cancelled uploads as active stats sync', () => {
    expect(isRecordingStatsSyncActive({ lastAnalysisError: 'Upload cancelled', analysisReadiness: {
      ready: false, state: 'waiting_match_data', message: 'Waiting for stats', duelMomentCount: 0,
    } })).toBe(false)
  })
  it('does not show paused recordings as actively syncing', () => {
    expect(isRecordingStatsSyncActive({
      matchStatsSyncPaused: true,
      analysisReadiness: {
        ready: false,
        state: 'waiting_match_data',
        message: 'Still fetching match stats',
        duelMomentCount: 0,
      },
    })).toBe(false)
  })

  it('shows an unpaused recording while stats are pending', () => {
    expect(isRecordingStatsSyncActive({
      analysisReadiness: {
        ready: false,
        state: 'syncing',
        message: 'Syncing stats',
        duelMomentCount: 0,
      },
    })).toBe(true)
  })
})
