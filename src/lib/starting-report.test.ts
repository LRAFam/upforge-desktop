import { describe, expect, it } from 'vitest'
import { formatMetric, showStartingCard, startingReportView, type StartingReportResponse } from './starting-report'

const ready: StartingReportResponse = {
  success: true, game: 'valorant', status: 'ready', matches_used: 5, report_source: 'ai',
  generated_at: '2026-10-30T10:00:00Z', dismissed: false,
  facts: { matches: 5, wins: 2, losses: 3, pool: [{ name: 'Jett', matches: 4, wins: 1 }],
    metrics: { opening_death_rate: { label: 'Opening deaths (share of rounds)', avg: 0.18, unit: 'share', better: 'lower', matches: 5 },
      acs: { label: 'ACS', avg: 212, unit: 'count', better: 'higher', matches: 5 } } },
  report: {
    summary: [{ finding_id: 'record', text: 'Across your last 5 matches you won 2 and lost 3.' }],
    strengths: [{ finding_id: 'm:acs', text: 'Your ACS averaged 212.' }],
    habits: [{ finding_id: 'f:opening_deaths_3plus', text: 'You died first in 3 or more rounds in 3 of 5 matches.' }],
    first_focus: { metric: 'opening_death_rate', reason: { finding_id: 'm:opening_death_rate', text: 'Opening deaths averaged 18%.' } },
  },
  focus_suggestion: { metric: 'opening_death_rate', label: 'Opening deaths', better: 'lower', current: 0.18, target: 0.11, games: 3 },
}

describe('startingReportView', () => {
  it('shapes a ready report with whole numbers and a startable focus', () => {
    const v = startingReportView(ready)
    expect(v.kind).toBe('ready')
    if (v.kind !== 'ready') return
    expect(v.record).toBe('5 matches · 2 wins · 3 losses')
    expect(v.habits[0]).toContain('3 of 5 matches')
    expect(v.pool).toEqual(['Jett · 4 matches'])
    expect(v.stats).toContainEqual({ label: 'Opening deaths (share of rounds)', value: '18%' })
    expect(v.focus?.target).toBe('Aim for at most 11% over your next 3 games')
    expect(v.focus?.canStart).toBe(true)
  })

  it('cannot start a focus for games without a focus loop', () => {
    const v = startingReportView({ ...ready, game: 'deadlock' })
    expect(v.kind === 'ready' && v.focus?.canStart).toBe(false)
  })

  it('reports how many matches are still needed', () => {
    expect(startingReportView({ status: 'insufficient', matches_available: 1 })).toEqual({ kind: 'insufficient', available: 1, needed: 3 })
    expect(startingReportView({ status: 'none' })).toEqual({ kind: 'none' })
    expect(startingReportView(null)).toEqual({ kind: 'none' })
  })
})

describe('showStartingCard', () => {
  const at = Date.parse('2026-10-30T10:00:00Z')
  it('shows during the first week until dismissed', () => {
    expect(showStartingCard(ready, at + 3 * 86400000)).toBe(true)
    expect(showStartingCard(ready, at + 8 * 86400000)).toBe(false)
    expect(showStartingCard({ ...ready, dismissed: true }, at)).toBe(false)
    expect(showStartingCard({ ...ready, status: 'insufficient' }, at)).toBe(false)
  })
})

describe('formatMetric', () => {
  it('formats shares, seconds and counts', () => {
    expect(formatMetric({ unit: 'share' }, 0.234)).toBe('23%')
    expect(formatMetric({ unit: 'seconds' }, 95)).toBe('1:35')
    expect(formatMetric({ unit: 'count' }, 56.7)).toBe('56.7')
    expect(formatMetric({ unit: 'count' }, 4)).toBe('4')
    expect(formatMetric({}, undefined)).toBe('—')
  })
})
