import { describe, expect, it } from 'vitest'
import { coachingStatLine, formatStatPct, isMatchStatsDrill } from './coaching-drill-stat'

const stat = (over = {}) => ({ label: 'HS', better: 'higher' as const, baseline_pct: 16, current_pct: 17, target_pct: 19, matches: 5, ...over })

describe('coachingStatLine', () => {
  it('reads baseline → target · now, better when a higher stat went up', () => {
    expect(coachingStatLine(stat())).toEqual({ text: 'HS 16% → target 19% · now 17%', trend: 'better' })
    expect(coachingStatLine(stat({ current_pct: 14 }))?.trend).toBe('worse')
  })

  it('treats a drop as better for lower-is-better stats', () => {
    const lower = stat({ label: 'Untraded deaths', better: 'lower', baseline_pct: 42, target_pct: 35, current_pct: 38 })
    expect(coachingStatLine(lower)).toEqual({ text: 'Untraded deaths 42% → target 35% · now 38%', trend: 'better' })
    expect(coachingStatLine({ ...lower, current_pct: 45 })?.trend).toBe('worse')
  })

  it('omits "now" when there is no current value yet', () => {
    expect(coachingStatLine(stat({ current_pct: null }))).toEqual({ text: 'HS 16% → target 19%', trend: null })
  })

  it('rounds to whole percents from 10 up and one decimal below', () => {
    expect(coachingStatLine(stat({ baseline_pct: 16.4, target_pct: 19.5, current_pct: 16.49 }))).toEqual({ text: 'HS 16% → target 20% · now 16%', trend: 'same' })
    expect(formatStatPct(2.46)).toBe('2.5%')
    expect(formatStatPct(3.04)).toBe('3%')
    expect(formatStatPct(9.96)).toBe('10%')
  })

  it('returns null for a missing or malformed stat', () => {
    expect(coachingStatLine(null)).toBeNull()
    expect(coachingStatLine(undefined)).toBeNull()
    expect(coachingStatLine(stat({ baseline_pct: Number.NaN }))).toBeNull()
  })
})

describe('isMatchStatsDrill', () => {
  it('only for source match_stats (older APIs send no source)', () => {
    expect(isMatchStatsDrill({ source: 'match_stats' })).toBe(true)
    expect(isMatchStatsDrill({ source: 'vod' })).toBe(false)
    expect(isMatchStatsDrill({})).toBe(false)
  })
})
