import { describe, expect, it } from 'vitest'
import { matchReportFactRows, matchReportPath, matchReportSupported, matchReportView, type MatchReportResponse } from './match-report'

const base: MatchReportResponse = {
  match_id: 'm-1',
  account: { is_main: true },
  report: {
    facts: {
      map: 'Bind', agent: 'Jett', won: false, score: { ally: 9, enemy: 13 },
      kda: { kills: 18, deaths: 17, assists: 4 }, acs: 241.6, adr: 154.2, lobby_rank: 2, lobby_size: 10,
      zero_damage_rounds: [4, 11], deaths: { total: 17, traded: 5, untraded: 12 },
      opening_impact: { first_kills: 1, first_kill_wins: 1, first_deaths: 8, first_death_wins: 1 },
    },
    notes: {
      headline: { finding_id: 'opening_deaths', text: 'You died first in 8 rounds and won 1 of them.' },
      next_action: { finding_id: 'early_opening_deaths', text: 'Clear one angle at a time before the first fight.' },
    },
  },
  focus: null,
  notes_usage: { used: 1, limit: 1 },
}

describe('matchReportView', () => {
  it('builds the headline, result and score from the stored report', () => {
    const v = matchReportView(base)
    expect(v.result).toBe('loss')
    expect(v.score).toBe('9–13')
    expect(v.headline).toBe('You died first in 8 rounds and won 1 of them.')
    expect(v.notesCapped).toBe(false)
  })

  it('links the next step to the matching drills', () => {
    expect(matchReportView(base).nextSteps).toEqual([{ text: 'Clear one angle at a time before the first fight.', drillMetric: 'early_opening_death_rate' }])
  })

  it('says notes are capped only when there are no notes and today\'s free notes are used', () => {
    const noNotes = { ...base, report: { ...base.report, notes: null } }
    expect(matchReportView(noNotes).notesCapped).toBe(true)
    expect(matchReportView({ ...noNotes, notes_usage: { used: 0, limit: 1 } }).notesCapped).toBe(false)
  })

  it('marks alt-account matches', () => {
    expect(matchReportView({ ...base, account: { is_main: false } }).isAlt).toBe(true)
  })
})

describe('matchReportFactRows', () => {
  it('uses whole numbers in sentences and leaves out missing values', () => {
    const rows = matchReportFactRows(base.report!.facts)
    expect(rows).toContainEqual({ label: 'Opening duels', value: '1 first kill, 8 first deaths' })
    expect(rows).toContainEqual({ label: 'Rounds won after dying first', value: '1 of 8' })
    expect(rows).toContainEqual({ label: 'Deaths traded', value: '5 of 17' })
    expect(rows).toContainEqual({ label: 'Combat score', value: '242' })
    expect(matchReportFactRows({ map: 'Bind' })).toEqual([])
  })
})

describe('matchReportSupported', () => {
  it('covers all four games', () => {
    for (const g of ['valorant', 'lol', 'deadlock', 'cs2']) expect(matchReportSupported(g)).toBe(true)
    expect(matchReportSupported('dota2')).toBe(false)
  })
})

describe('matchReportPath', () => {
  it('builds a report route per game and refuses malformed ids', () => {
    expect(matchReportPath('valorant', 'abc-123')).toBe('/report/abc-123')
    expect(matchReportPath('lol', 'EUW1_7123')).toBe('/report/EUW1_7123?game=lol')
    expect(matchReportPath('lol', 'not a match')).toBeNull()
    expect(matchReportPath('deadlock', '55012')).toBe('/report/55012?game=deadlock')
    expect(matchReportPath('deadlock', 'hero_13')).toBeNull()
    expect(matchReportPath('cs2', null, 'rec_1')).toBe('/report/rec_1?game=cs2')
    expect(matchReportPath('cs2', 'x', null)).toBeNull()
  })
})
