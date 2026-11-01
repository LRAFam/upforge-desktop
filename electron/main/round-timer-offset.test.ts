import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_VIDEO_SYNC_OFFSET_MS, recomputeTimelineVideoOffsets, totalRecordingOffsetMs } from './riot-local-api'
import { applyVodTrimToTimeline } from './vod-trimmer'
import type { MatchData } from './riot-types'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => process.cwd() } }))

const timeline = (extra: Partial<MatchData> = {}): MatchData => ({
  game: 'valorant', matchStartTime: 1_000_000, recordingStartTime: 1_007_000, gameplayStartTime: null,
  videoSyncOffsetMs: DEFAULT_VIDEO_SYNC_OFFSET_MS,
  killEvents: [{ timeSinceGameStartMillis: 60_000 }], playerKills: [], playerDeaths: [],
  ...extra,
} as unknown as MatchData)

describe('round-timer offset in the recording offset math', () => {
  it('uses the measured offset instead of the loading-time estimate', () => {
    const t = timeline({ roundTimerOffsetMs: -13_375 })
    expect(totalRecordingOffsetMs(t)).toBe(-13_375)
    recomputeTimelineVideoOffsets(t)
    expect(t.killEvents[0]!.videoOffsetMs).toBe(60_000 - 13_375)
  })

  it('applies a manual nudge on top of the measured offset, and Reset returns to it', () => {
    const t = timeline({ roundTimerOffsetMs: -13_375, videoSyncOffsetMs: DEFAULT_VIDEO_SYNC_OFFSET_MS + 500 })
    expect(totalRecordingOffsetMs(t)).toBe(-12_875)
    t.videoSyncOffsetMs = DEFAULT_VIDEO_SYNC_OFFSET_MS
    expect(totalRecordingOffsetMs(t)).toBe(-13_375)
  })

  it('keeps the old estimate when nothing was measured', () => {
    expect(totalRecordingOffsetMs(timeline())).not.toBe(-13_375)
  })

  it('moves the measured offset when the start of the recording is trimmed', () => {
    const t = timeline({ roundTimerOffsetMs: -13_375 })
    applyVodTrimToTimeline(t, { startSec: 5, endSec: 3600 })
    expect(t.roundTimerOffsetMs).toBe(-18_375)
  })
})
