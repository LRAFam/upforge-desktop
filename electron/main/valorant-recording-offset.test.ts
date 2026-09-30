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

it('subtracts late recording startup instead of shifting every event past its footage', () => {
  const timeline = {
    game: 'valorant', matchStartTime: 1_000_000,
    recordingStartTime: 1_040_000, gameplayStartTime: 1_050_000,
    videoSyncOffsetMs: 0,
  } as MatchData
  expect(totalRecordingOffsetMs(timeline)).toBe(-30_000)
})

it('keeps pre-recording events negative so they cannot masquerade as first-frame footage', async () => {
  const { recomputeTimelineVideoOffsets } = await import('./riot-local-api')
  const { duelMomentsForUpload } = await import('./moment-picker')
  const timeline = {
    game: 'valorant', matchStartTime: 1_000_000, recordingStartTime: 1_040_000,
    gameplayStartTime: 1_050_000, videoSyncOffsetMs: 0,
    playerDeaths: [{ round: 0, timeSinceGameStartMillis: 10_000 }, { round: 1, timeSinceGameStartMillis: 60_000 }],
  } as MatchData
  recomputeTimelineVideoOffsets(timeline)
  expect(timeline.playerDeaths[0].videoOffsetMs).toBe(-20_000)
  expect(timeline.playerDeaths[1].videoOffsetMs).toBe(30_000)
  expect(duelMomentsForUpload(timeline)).toHaveLength(1)
})

it('calibrates the reported Swiftplay offset without changing other recordings', async () => {
  const { nudgeTimelineSyncOffset } = await import('./riot-local-api')
  const timeline = {
    game: 'valorant', matchStartTime: 1790765559189,
    gameplayStartTime: 1790765567455, recordingStartTime: 1790765567176,
    videoSyncOffsetMs: -8000,
    playerKills: [{ timeSinceGameStartMillis: 71900, videoOffsetMs: 63900 }],
    playerDeaths: [{ timeSinceGameStartMillis: 80798, videoOffsetMs: 72798 }],
  } as MatchData
  const untouched = structuredClone(timeline)
  nudgeTimelineSyncOffset(timeline, -5000)
  expect(timeline.playerKills[0].videoOffsetMs).toBe(58900)
  expect(timeline.playerDeaths[0].videoOffsetMs).toBe(67798)
  expect(timeline.videoSyncOffsetMs).toBe(-13000)
  expect(totalRecordingOffsetMs(untouched)).toBe(-8000)
})
