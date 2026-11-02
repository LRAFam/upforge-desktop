import { describe, expect, it } from 'vitest'
import { formatMetric, insufficientLine, sharesAsPercents, showStartingCard, startingReportView, startingStat, type StartingReportResponse } from './starting-report'

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
    expect(v.stats).toContainEqual({ label: 'Opening deaths (share of rounds)', value: '18%', range: null, bar: null })
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
    expect(formatMetric({ unit: 'count' }, 24304.8)).toBe('24,305')
    expect(startingStat({ label: 'Time spent dead (seconds)', unit: 'seconds', avg: 419 }).label).toBe('Time spent dead')
  })
})

describe('shares in the coach sentences (audit 2 Nov)', () => {
  const metrics = { opening_death_rate: { label: 'Opening deaths', avg: 0.141, best: 0.038, worst: 0.312, unit: 'share', better: 'lower', matches: 10 },
    acs: { label: 'ACS', avg: 199.2, best: 273, worst: 123, unit: 'count', better: 'higher', matches: 10 } }
  const res: StartingReportResponse = { ...ready, facts: { ...ready.facts, metrics },
    report: { ...ready.report!, summary: [{ text: 'Your opening death rate averages 0.141 across 10 matches.' }],
      first_focus: { metric: 'opening_death_rate', reason: { text: 'Opening deaths average 0.141 over 10 matches, with a worst of 0.312; ACS 199.2.' } } } }

  it('rewrites matching share decimals as whole percents and leaves the rest', () => {
    const v = startingReportView(res)
    if (v.kind !== 'ready') throw new Error('not ready')
    expect(v.summary[0]).toBe('Your opening death rate averages 14% across 10 matches.')
    expect(v.focus?.reason).toBe('Opening deaths average 14% over 10 matches, with a worst of 31%; ACS 199.2.')
  })
  it('never touches decimals that are not this report\'s shares', () => {
    expect(sharesAsPercents('K/D 0.85 and 0.141', [0.141])).toBe('K/D 0.85 and 14%')
    expect(sharesAsPercents('ACS 199.2', [0.2])).toBe('ACS 199.2')
    expect(sharesAsPercents('already 14%', [0.14])).toBe('already 14%')
  })
  it('draws the player\'s own spread, no benchmark', () => {
    const share = startingStat(metrics.opening_death_rate)
    expect(share.value).toBe('14%')
    expect(share.range).toBe('worst 31% · best 4%')
    expect(share.bar).toEqual({ avg: 0.141, lo: 0.038, hi: 0.312 })
    const count = startingStat(metrics.acs)
    expect(count.bar?.hi).toBe(1)
    expect(count.range).toBe('worst 123 · best 273')
  })
})

describe('insufficientLine', () => {
  it('tells CS2 players the report needs demos parsed on this PC', () => {
    expect(insufficientLine('cs2', 0, 3)).toBe('Your CS2 report reads match demos parsed on this PC, and it needs 3. None are ready yet. Record 3 more CS2 matches with UpForge open; each demo is read after the match.')
    expect(insufficientLine('cs2', 2, 3)).toContain('2 are ready. Record 1 more CS2 match')
  })
  it('keeps the plain line for the other games', () => {
    expect(insufficientLine('valorant', 1, 3)).toBe('We found 1 match. Play 2 more and your starting report is written automatically.')
  })
})
