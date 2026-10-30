import { describe, expect, it } from 'vitest'
import { matchReportFactRows, matchReportSupported, matchReportView, type MatchReportResponse } from './match-report'

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
  it('is Valorant only for now', () => {
    expect(matchReportSupported('valorant')).toBe(true)
    expect(matchReportSupported('lol')).toBe(false)
  })
})
