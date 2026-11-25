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

const measured = (over = {}) => stat({ current_pct: 19, current_matches: 3, matches_needed: 3, current_hits: 10000, current_numerator: 1895, minimum_hits: 80, progress_status: 'target_not_met', measurement: 'pooled_hits_latest_eligible_ranked', window_started_at: '2026-11-24T10:00:00Z', ...over })
describe('assigned match verification window', () => {
  it('uses authoritative outcome even when rounded current percent equals the displayed target', () => {
    const line = coachingStatLine(measured())!
    expect(line.text).toBe('HS 16% → target at least 19% · observed just below target')
    expect(line.verification?.status).toBe('target_not_met')
    expect(line.verification?.label).toBe('Target not met in this window')
    expect(line.verification?.detail).toContain('latest 3 eligible ranked Valorant matches')
    expect(line.verification?.detail).toContain('after this task was assigned')
    expect(line.verification?.detail).toContain('Match statistics and trainer scores are tracked separately.')
  })
  it('separates too few matches, too few combined hits and a measured target miss', () => {
    const waiting = coachingStatLine(measured({ current_matches: 2, current_hits: 120, current_numerator: 20, progress_status: 'waiting_for_matches' }))!
    const sparse = coachingStatLine(measured({ current_hits: 60, current_numerator: 10, progress_status: 'insufficient_hits' }))!
    expect(waiting.verification?.label).toBe('Waiting for matches (2/3)')
    expect(sparse.verification?.label).toBe('Not enough hit data (60/80 hits)')
    expect(waiting.trend).toBeNull(); expect(sparse.trend).toBeNull()
  })
  it('renders inclusive lower target and trusts the server target-met decision', () => {
    const line = coachingStatLine(measured({ label: 'Untraded deaths', better: 'lower', baseline_pct: 42, target_pct: 35, current_pct: 35, current_hits: 100, current_numerator: 35, progress_status: 'target_met' }))!
    expect(line.text).toContain('target at most 35%')
    expect(line.verification?.label).toBe('Target met in this window')
  })
  it('does not manufacture measurement or success from unknown or incomplete contracts', () => {
    for (const change of [{ measurement: 'per_match_streak' }, { window_started_at: null }, { current_matches: 2, progress_status: 'target_met' }, { current_hits: 20, progress_status: 'target_met' }, { progress_status: 'new_status' }]) {
      const line = coachingStatLine(measured(change))!
      expect(line.verification?.status).toBe('unavailable'); expect(line.trend).toBeNull(); expect(line.text).not.toContain('observed')
    }
  })
})

it('keeps rounded lower-is-better misses above the target, with raw pooled counts', () => {
  const line = coachingStatLine(measured({ better: 'lower', current_pct: 19, current_numerator: 1905 }))!
  expect(line.text).toContain('observed just above target')
  expect(line.verification?.detail).toContain('1905/10000 hits')
  expect(line.verification?.status).toBe('target_not_met')
})

it('keeps explicit unavailable data neutral when target and measurement counts are null', () => {
  const line = coachingStatLine(measured({ target_pct: null, current_pct: null, current_matches: null, current_numerator: null, current_hits: null, matches_needed: null, minimum_hits: null, window_started_at: null, progress_status: 'unavailable' }))!
  expect(line.text).toBe('HS measurement')
  expect(line.verification).toEqual({ status: 'unavailable', label: 'Match measurement unavailable', detail: 'No usable match measurement is available for this task.' })
  expect(line.text + line.verification?.detail).not.toMatch(/target|3 eligible|80 total|zero|0%/)
})
it('keeps a valid empty window waiting without inventing an observed zero percentage', () => {
  const line = coachingStatLine(measured({ current_pct: null, current_matches: 0, current_hits: 0, current_numerator: 0, progress_status: 'waiting_for_matches' }))!
  expect(line.verification?.label).toBe('Waiting for matches (0/3)')
  expect(line.text).not.toContain('observed')
})
