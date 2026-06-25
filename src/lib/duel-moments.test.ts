import { describe, expect, it } from 'vitest'
import { duelMomentWeightReasons, mergeDuelMoments, pipelineStagesFromStep } from './duel-moments'

describe('duel-moments', () => {
  it('merges manifest with observations by moment_id', () => {
    const manifest = [
      {
        moment_id: 'death-r1-1000',
        round: 1,
        video_offset_ms: 1000,
        window_start_ms: 0,
        window_end_ms: 3000,
        callout: 'A Site',
        isolated: true,
        trigger: 'player_death' as const,
      },
    ]
    const observations = [
      {
        moment_id: 'death-r1-1000',
        confidence: 'high',
        key_observation: 'Wide swing with crosshair low',
      },
    ]
    const merged = mergeDuelMoments(manifest, observations)
    expect(merged[0].key_observation).toContain('Wide swing')
    expect(merged[0].isolated).toBe(true)
  })

  it('parses duel moment progress into vision stage', () => {
    const { activeIndex } = pipelineStagesFromStep('Analysing duel moment 2/5', 55, 5)
    expect(activeIndex).toBe(2)
  })

  it('explains isolated death weight', () => {
    const reasons = duelMomentWeightReasons({
      moment_id: 'x',
      round: 1,
      video_offset_ms: 1,
      window_start_ms: 0,
      window_end_ms: 1,
      callout: 'Mid',
      isolated: true,
    })
    expect(reasons).toContain('Untraded death')
  })
})
