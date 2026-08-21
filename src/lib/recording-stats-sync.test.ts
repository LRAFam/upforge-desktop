import { describe, expect, it } from 'vitest'
import { isRecordingStatsSyncActive } from './recording-stats-sync'

describe('isRecordingStatsSyncActive', () => {
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
