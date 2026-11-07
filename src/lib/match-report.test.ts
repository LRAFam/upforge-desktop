import { describe, expect, it } from 'vitest'
import { matchReportFactRows, matchReportPath, matchReportSupported, matchReportView, recurrenceLine, type MatchReportResponse } from './match-report'

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

  it('shows the coach evidence, catalogue drill and rounds to rewatch', () => {
    const notes = {
      ...base.report!.notes!,
      next_action: { finding_id: 'opening_duels', text: 'Take the first duel only when a teammate is ready to swing.' },
      evidence: [
        { finding_id: 'lobby', text: 'Enemy Jett won 4 opening duels and lost 3; you won 1 and lost 8.', rounds: [] },
        { finding_id: 'trades', text: '', rounds: [] },
      ],
      drill: { finding_id: 'opening_duels', drill_id: 'over_peeking', why: 'Trains checking one angle at a time.', drill: 'Deathmatch 10 min: jiggle every angle once' },
      watch_rounds: [{ round: 7, finding_id: 'opening_deaths', why: 'Died 1 second in to an Operator.' }, { round: 0, finding_id: 'x', why: 'bad' }],
      enemy_read: { finding_id: 'enemy_attack', text: 'On attack they planted B in 4 rounds and A in 2.', rounds: [13] },
    }
    const v = matchReportView({ ...base, report: { ...base.report, notes } })
    expect(v.evidence).toEqual(['Enemy Jett won 4 opening duels and lost 3; you won 1 and lost 8.'])
    expect(v.drill).toEqual({ text: 'Deathmatch 10 min: jiggle every angle once', why: 'Trains checking one angle at a time.' })
    expect(v.watchRounds).toEqual([{ round: 7, why: 'Died 1 second in to an Operator.' }])
    expect(v.nextSteps[0].drillMetric).toBe('opening_death_rate')
    expect(v.enemyRead).toBe('On attack they planted B in 4 rounds and A in 2.')
  })

  it('leaves the drill out when the coach picked none', () => {
    const notes = { ...base.report!.notes!, drill: { finding_id: 'x', drill_id: '', why: '' } }
    const v = matchReportView({ ...base, report: { ...base.report, notes } })
    expect(v.drill).toBeNull()
    expect(v.watchRounds).toEqual([])
    expect(v.enemyRead).toBeNull()
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

describe('matchReportView · UpForge score', () => {
  it('carries the stats score and breakdown; null on production reports without them', () => {
    const v = matchReportView({ ...base, upforge_score: 655, upforge_score_breakdown: { baseline: { source: 'prior', tier: null, samples: null }, inputs: [{ key: 'acs', label: 'ACS', value: 241, percentile: 80, weight: 0.3 }] } })
    expect(v.upforgeScore).toBe(655)
    expect(v.upforgeScoreBreakdown?.inputs).toHaveLength(1)
    expect(matchReportView(base).upforgeScore).toBeNull()
  })
})

describe('recurrenceLine', () => {
  const r = (seen: number, of: number, streak = 0) => ({ finding_id: 'opening_deaths', seen, of, streak })
  it('calls a repeated finding a habit and puts it first', () => {
    expect(recurrenceLine(r(4, 10, 0))).toEqual({ tone: 'habit', text: 'Also came up in 4 of your last 10 matches. It keeps costing you rounds, so fix this before anything else.' })
    expect(recurrenceLine(r(3, 5, 3))!.text).toBe('4 matches in a row. This is a habit now, not a one-off, so it\'s the one to fix first.')
  })
  it('notes a single repeat and a new finding', () => {
    expect(recurrenceLine(r(1, 6))).toEqual({ tone: 'again', text: 'Also came up in 1 of your last 6 matches.' })
    expect(recurrenceLine(r(0, 5))).toEqual({ tone: 'new', text: 'New: not in your last 5 matches.' })
  })
  it('says nothing without enough history or data', () => {
    expect(recurrenceLine(r(0, 2))).toBeNull()
    expect(recurrenceLine(r(0, 0))).toBeNull()
    expect(recurrenceLine(null)).toBeNull()
  })
})
