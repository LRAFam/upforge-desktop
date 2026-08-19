import { describe, expect, it } from 'vitest'
import {
  buildOrphanValorantTimeline,
  orphanRecordingTimingFromStat,
} from './orphan-recording-recovery'

describe('orphan recording recovery', () => {
  it('uses filesystem creation and modification times as the explicit recording interval', () => {
    const timing = orphanRecordingTimingFromStat({
      birthtimeMs: 1_700_000_000_000,
      mtimeMs: 1_700_001_800_000,
    })

    expect(timing).toEqual({
      status: 'ok',
      startTimeMs: 1_700_000_000_000,
      endTimeMs: 1_700_001_800_000,
      source: 'fs.birthtimeMs+fs.mtimeMs',
    })
  })

  it('does not invent timing when the file interval is invalid', () => {
    expect(orphanRecordingTimingFromStat({ birthtimeMs: 0, mtimeMs: 1_700_000_000_000 })).toEqual({
      status: 'missing',
      reason: 'invalid_file_times',
    })
    expect(orphanRecordingTimingFromStat({
      birthtimeMs: 1_700_000_000_000,
      mtimeMs: 1_700_000_030_000,
    })).toEqual({
      status: 'missing',
      reason: 'invalid_recording_duration',
    })
  })

  it('builds a recovery timeline without fabricating match metadata', () => {
    const timing = orphanRecordingTimingFromStat({
      birthtimeMs: 1_700_000_000_000,
      mtimeMs: 1_700_001_800_000,
    })
    if (timing.status !== 'ok') throw new Error('expected valid timing')

    const timeline = buildOrphanValorantTimeline(timing, { name: 'Player', tag: 'EUW' })

    expect(timeline.recordingStartTime).toBe(timing.startTimeMs)
    expect(timeline.endTime).toBe(timing.endTimeMs)
    expect(timeline.playerName).toBe('Player')
    expect(timeline.playerTag).toBe('EUW')
    expect(timeline.matchId).toBeNull()
    expect(timeline.map).toBeNull()
    expect(timeline.agent).toBeNull()
  })
})
