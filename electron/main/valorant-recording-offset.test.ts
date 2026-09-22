import { describe, expect, it, vi } from 'vitest'
vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => process.cwd() } }))
import { totalRecordingOffsetMs } from './riot-local-api'
import type { MatchData } from './riot-types'

describe('Valorant recording lead-in', () => {
  it('includes footage recorded before the match in every duel offset', () => {
    const timeline = {
      game: 'valorant', recordingStartTime: 1_000_000,
      matchStartTime: 1_000_000 + 46 * 60_000,
      gameplayStartTime: 1_000_000 + 46 * 60_000 + 1000,
      videoSyncOffsetMs: -8000,
    } as MatchData
    expect(totalRecordingOffsetMs(timeline)).toBe(46 * 60_000 + 2000)
  })
})
