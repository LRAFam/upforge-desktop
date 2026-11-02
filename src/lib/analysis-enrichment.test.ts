import { describe, expect, it } from 'vitest'
import { enrichAnalysisDetail } from './analysis-enrichment'

describe('analysis detail contract', () => {
  it('reads rich review fields from their canonical top-level API fields', () => {
    const detail = enrichAnalysisDetail({
      summary: 'Match summary',
      coaching_diagnosis: 'Round-linked diagnosis',
      key_strengths: ['R2 [01:20] — patient hold'],
      category_scores: [{ category: 'positioning', score: 6, reasoning: 'Two reviewed deaths' }],
      drill_recommendations: [{ title: 'Smoke awareness', practice_mode: 'vod_review' }],
      pattern_insights: ['R4 and R8 share a verified cause.'],
      behaviours: [{
        behaviour_id: 'trade_spacing',
        occurrences: 2,
        confidence: 'high',
        evidence: ['R4 [02:00]', 'R8 [07:10]'],
      }],
      insights: [{ behaviour_id: 'trade_spacing', verdict: 'weakness', text: 'Two occurrences.' }],
      confidence: { behaviour: 'high', recommendation: 'medium' },
      observation_confidence: 'medium',
    })

    expect(detail.summary).toBe('Match summary')
    expect(detail.key_strengths).toHaveLength(1)
    expect(detail.category_scores[0]).toMatchObject({ category: 'positioning', score: 6 })
    expect(detail.drill_recommendations[0].title).toBe('Smoke awareness')
    expect(detail.behaviours[0].evidence).toEqual(['R4 [02:00]', 'R8 [07:10]'])
    expect(detail.confidence?.recommendation).toBe('medium')
  })

  it('does not fabricate rich fields from unrelated nested payloads', () => {
    const detail = enrichAnalysisDetail({ analysis: JSON.stringify({ summary: 'Nested only' }) })

    expect(detail.summary).toBeNull()
    expect(detail.category_scores).toEqual([])
    expect(detail.pattern_insights).toEqual([])
    expect(detail.confidence).toBeNull()
  })
})

describe('stats-only report flags', () => {
  it('passes the API stats-only flags through to the screens', () => {
    const detail = enrichAnalysisDetail({
      report_type: 'degraded_telemetry',
      coaching_source: 'telemetry_only',
      limitations: ['No duel moment could be reviewed from the video.', 3],
      is_degraded: true,
      credit_returned: true,
    })
    expect(detail.is_degraded).toBe(true)
    expect(detail.credit_returned).toBe(true)
    expect(detail.report_type).toBe('degraded_telemetry')
    expect(detail.limitations).toEqual(['No duel moment could be reviewed from the video.'])
  })
  it('never claims a refund the API did not confirm', () => {
    const detail = enrichAnalysisDetail({ is_degraded: true, credit_returned: 'true' })
    expect(detail.credit_returned).toBe(false)
    expect(enrichAnalysisDetail({}).is_degraded).toBe(false)
  })
})

describe('UpForge score on GET /api/analysis/{id}', () => {
  it('keeps upforge_score and the breakdown; null when the API does not send them', () => {
    const d = enrichAnalysisDetail({
      upforge_score: 612,
      upforge_score_breakdown: { baseline: { source: 'tier', tier: 'platinum', samples: 1240 }, inputs: [{ key: 'acs', label: 'ACS', value: 241, percentile: 72, weight: 0.3 }] },
    })
    expect(d.upforge_score).toBe(612)
    expect(d.upforge_score_breakdown?.baseline.tier).toBe('platinum')
    const none = enrichAnalysisDetail({})
    expect([none.upforge_score, none.upforge_score_breakdown]).toEqual([null, null])
  })
})
