import { describe, expect, it } from 'vitest'
import { drillHasMoments, parseDrillMoments } from './drill-moments'
import { matchDrillRows } from '../components/v3/practice/practice-v3'

describe('drill source links', () => {
  it('retains evidence availability for both drill sources, without inventing it for older/manual drills', () => {
    const base = { id: 1, title: 'Drill', category: 'mechanics', instructions: null, success_metric: null, practice_mode: null }
    const rows = matchDrillRows([
      { ...base, source_analysis_id: 42 },
      { ...base, id: 2, source: 'match_stats', moment_matches: 5 },
      { ...base, id: 3 },
    ], () => undefined)
    expect(rows.map(r => !!r.hasMoments)).toEqual([true, true, false])
    expect(drillHasMoments({ source_analysis_id: -1, source: 'match_stats', moment_matches: Infinity })).toBe(false)
  })

  it('parses the source review and uses desktop report routes for measured matches', () => {
    const parsed = parseDrillMoments({ drill_id: 1, review: { analysis_id: 42 }, matches: [
      { match_id: 'valorant-123', game: 'valorant', map: 'Ascent', agent: 'Jett', value_pct: 17.4 },
      { match_id: '123456', game: 'deadlock', value_pct: null },
      { match_id: 'EUW1_123456', game: 'lol' },
      { match_id: 'demo', recording_id: 'rec-123', game: 'cs2' },
    ] }, 1)!
    expect(parsed.reviewId).toBe(42)
    expect(parsed.matches.map(m => m.to)).toEqual(['/report/valorant-123', '/report/123456?game=deadlock', '/report/EUW1_123456?game=lol', '/report/rec-123?game=cs2'])
    expect(parsed.matches[0]).toMatchObject({ label: 'Ascent · Jett', value: '17%' })
  })

  it('distinguishes an unavailable response from a valid empty source and discards invalid paths', () => {
    expect(parseDrillMoments(null, 1)).toBeNull()
    expect(parseDrillMoments({ drill_id: 2, matches: [] }, 1)).toBeNull()
    expect(parseDrillMoments({ drill_id: 1, success: false, matches: [] }, 1)).toBeNull()
    expect(parseDrillMoments({ drill_id: 1, matches: [null, { match_id: '../../settings' }, { match_id: 'undefined' }, { match_id: 'x', recording_id: 'null', game: 'cs2' }, { match_id: 'x', game: 'cs2' }, { match_id: 'x', game: 'other' }] }, 1))
      .toEqual({ reviewId: null, matches: [] })
  })
})
