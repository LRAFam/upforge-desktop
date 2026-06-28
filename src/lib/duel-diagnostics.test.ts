import { describe, expect, it } from 'vitest'
import {
  diagnosticsSummary,
  duelWindowForMoment,
  formatDebugReport,
  momentHasVisionSignal,
  parseDuelFailureDiagnostics,
} from './duel-diagnostics'

describe('duel-diagnostics', () => {
  it('ignores unknown-only structured fields', () => {
    expect(momentHasVisionSignal({
      moment_id: 'x',
      round: 1,
      video_offset_ms: 1000,
      window_start_ms: 0,
      window_end_ms: 10000,
      peek_sequence: ['unknown'],
      crosshair_on_commit: 'unknown',
    })).toBe(false)
  })

  it('builds summary with clip upload counts', () => {
    const d = parseDuelFailureDiagnostics({
      moments_requested: 2,
      moments_observed: 0,
      clips_uploaded: 1,
      clips_requested: 2,
      moments: [
        {
          moment_id: 'a',
          round: 1,
          video_offset_ms: 5000,
          window_start_ms: 0,
          window_end_ms: 8000,
          clip_s3_key: 'jobs/a.mp4',
          caveats: ['Gemini returned no signal'],
        },
      ],
    })
    expect(d).not.toBeNull()
    expect(diagnosticsSummary(d!)).toContain('1/2 duel clips uploaded')
    expect(formatDebugReport(d!)).toContain('clip=yes')
  })

  it('derives duel window from death offset when manifest fields missing', () => {
    expect(duelWindowForMoment({
      moment_id: 'd1',
      round: 2,
      video_offset_ms: 120_000,
      window_start_ms: undefined as unknown as number,
      window_end_ms: undefined as unknown as number,
      callout: null,
      isolated: false,
    })).toEqual({ startMs: 112_000, endMs: 122_000 })
  })
})
