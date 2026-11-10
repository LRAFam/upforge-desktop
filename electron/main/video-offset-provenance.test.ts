import { describe, expect, it } from 'vitest'
import { videoOffsetProvenance } from './video-offset-provenance'
import type { MatchData } from './riot-types'

const timeline = (fields: Partial<MatchData> = {}) => ({ game: 'valorant', matchStartTime: 1000, recordingStartTime: 5000, ...fields } as MatchData)
const timer = { samples: 12, rounds: 3, spreadMs: 100, outliers: 1 }

describe('video offset evidence', () => {
  it('keeps loading and legacy timer offsets estimated', () => {
    expect(videoOffsetProvenance(timeline())).toMatchObject({ status: 'estimated', source: 'loading_estimate', manualAdjustmentMs: 0, uncertaintyMs: null })
    expect(videoOffsetProvenance(timeline({ roundTimerOffsetMs: -4000 }))).toMatchObject({ status: 'estimated', source: 'round_timer' })
  })
  it('preserves measured tick evidence without presenting spread as an error bound', () => {
    expect(videoOffsetProvenance(timeline({ roundTimerOffsetMs: -4000, roundTimerEvidence: timer })))
      .toEqual({ status: 'measured', source: 'round_timer', uncertaintyMs: null, manualAdjustmentMs: 0, timer })
  })
  it('marks hand adjustments as estimated even when a measured base exists', () => {
    expect(videoOffsetProvenance(timeline({ roundTimerOffsetMs: -4000, roundTimerEvidence: timer, videoSyncOffsetMs: -7000 })))
      .toMatchObject({ status: 'estimated', source: 'user_adjusted', manualAdjustmentMs: 1000, timer })
  })
  it('requires saved GSI consensus evidence for measured CS2 offsets', () => {
    const cs2 = timeline({ game: 'cs2', cs2DemoVideoShiftMs: 3000 })
    expect(videoOffsetProvenance(cs2).status).toBe('estimated')
    cs2.cs2DemoSyncEvidence = { pairs: 4, livePoints: 5 }
    expect(videoOffsetProvenance(cs2)).toMatchObject({ status: 'measured', source: 'cs2_demo_anchor', uncertaintyMs: null })
  })
  it('does not manufacture evidence for missing or non-finite clocks', () => {
    expect(videoOffsetProvenance(timeline({ matchStartTime: null, gameplayStartTime: null, recordingStartTime: NaN })))
      .toMatchObject({ status: 'unknown', source: 'unavailable' })
    expect(videoOffsetProvenance(timeline({ roundTimerOffsetMs: 3000, roundTimerEvidence: { ...timer, spreadMs: NaN } })).status).toBe('estimated')
  })
})
