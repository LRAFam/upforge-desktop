import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { LibraryRecording } from '../../../lib/footage-library'
import { matchListGroups, notRecordedReason, reportOnlyRows, reportPlayedAt, reportRowView, showReportRows, type MatchReportRow } from './report-rows'

// Monday 2 Nov 2026, 12:00 local time.
const now = new Date(2026, 10, 2, 12, 0).getTime()
const iso = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).toISOString()

function report(over: Partial<MatchReportRow> = {}): MatchReportRow {
  return {
    match_id: 'm-1', played_at: iso(2026, 10, 2, 9), map: 'Bind', agent: 'Jett', won: false,
    score: { ally: 9, enemy: 13 }, headline: 'You died first in 8 rounds and won 1 of them.', notes_source: 'ai',
    game_mode: 'COMPETITIVE', queue: 'ranked', upforge_score: 431, ...over,
  }
}
function rec(over: Partial<LibraryRecording> = {}): LibraryRecording {
  return {
    id: 'rec-1', path: '/v/rec-1.mp4', game: 'valorant', map: 'Bind', agent: 'Jett', gameMode: 'COMPETITIVE',
    recordedAt: new Date(2026, 10, 2, 10).getTime(), analysed: false, matchId: 'm-recorded', ...over,
  }
}

describe('reportOnlyRows', () => {
  it('keeps reports of matches that have no recording', () => {
    const rows = reportOnlyRows([report({ match_id: 'm-recorded' }), report({ match_id: 'm-free' })], [rec()])
    expect(rows.map(r => r.match_id)).toEqual(['m-free'])
  })

  it('lists a match once and drops ids that could not be a route', () => {
    const rows = reportOnlyRows([report(), report(), report({ match_id: '../x' }), report({ match_id: '' })], [])
    expect(rows.map(r => r.match_id)).toEqual(['m-1'])
  })

  it('a recording without a match id hides nothing', () => {
    expect(reportOnlyRows([report()], [rec({ matchId: null }), rec({ matchId: undefined })])).toHaveLength(1)
  })
})

describe('showReportRows', () => {
  const view = { game: 'all', status: 'all', account: 'all', selecting: false }
  it('shows them in the unfiltered list and under Valorant', () => {
    expect(showReportRows(view)).toBe(true)
    expect(showReportRows({ ...view, game: 'valorant', account: 'main' })).toBe(true)
  })
  it('hides them under footage filters, other games, alts only, or while selecting to delete', () => {
    expect(showReportRows({ ...view, status: 'local' })).toBe(false)
    expect(showReportRows({ ...view, status: 'analysed' })).toBe(false)
    expect(showReportRows({ ...view, game: 'cs2' })).toBe(false)
    expect(showReportRows({ ...view, account: 'alt' })).toBe(false)
    expect(showReportRows({ ...view, selecting: true })).toBe(false)
  })
})

describe('matchListGroups', () => {
  it('puts recordings and report-only matches in one dated list, newest first', () => {
    const groups = matchListGroups(
      [rec({ id: 'rec-today', recordedAt: new Date(2026, 10, 2, 10).getTime() })],
      [report({ match_id: 'm-today', played_at: iso(2026, 10, 2, 11) }), report({ match_id: 'm-old', played_at: iso(2026, 8, 5) })],
      r => r.recordedAt,
      now,
    )
    expect(groups[0]!.label).toBe('Today')
    expect(groups[0]!.items.map(i => i.key)).toEqual(['report:m-today', 'rec:rec-today'])
    expect(groups[groups.length - 1]!.items.map(i => i.key)).toEqual(['report:m-old'])
  })

  it('is just the recordings when there are no report rows', () => {
    const groups = matchListGroups([rec()], [], r => r.recordedAt, now)
    expect(groups.flatMap(g => g.items).map(i => i.kind)).toEqual(['recording'])
  })
})

describe('reportRowView', () => {
  it('shows result, score, map, who and when, and the coach headline', () => {
    const v = reportRowView(report(), now)
    expect(v).toMatchObject({ tone: 'loss', resultWord: 'Defeat', score: '9–13', mapLabel: 'Bind', line: 'You died first in 8 rounds and won 1 of them.' })
    expect(v.meta).toBe('Jett · 3h ago · Competitive · Ranked')
    expect(v.score1000?.text).toBe('431')
  })

  it('names fun modes and falls back to a plain line when the report has facts only', () => {
    const v = reportRowView(report({ won: true, headline: null, game_mode: 'CLASSIC', upforge_score: null }), now)
    expect(v.tone).toBe('win')
    expect(v.resultWord).toBe('Victory')
    expect(v.meta).toBe('Jett · 3h ago · Unrated')
    expect(v.line).toBe('Match facts')
    expect(v.score1000).toBeNull()
  })

  it('copes with a report that has no result, score, agent or date', () => {
    const v = reportRowView(report({ won: null, score: null, agent: null, played_at: null, game_mode: null }), now)
    expect(v).toMatchObject({ tone: 'none', resultWord: '', score: '', meta: '' })
    expect(reportPlayedAt({ played_at: 'nope' })).toBe(0)
  })
})

describe('MatchesV3 lists unrecorded matches', () => {
  const page = readFileSync(new URL('../../../views/v3/MatchesV3.vue', import.meta.url), 'utf8')
  it('asks for every queue, not only ranked', () => {
    expect(page).toMatch(/listMatchReports\?\.\(50, \{ everyQueue: true \}\)/)
  })
  it('draws report rows in the same dated groups and opens the report', () => {
    expect(page).toMatch(/matchListGroups\(searchedRecordings\.value, searchedReports\.value, playedAt\)/)
    expect(page).toMatch(/<ReportRowV3 v-if="item\.kind === 'report'"/)
    expect(page).toMatch(/router\.push\(`\/report\/\$\{item\.report\.match_id\}`\)/)
  })
  it('shows the list instead of "No matches yet" when only unrecorded matches exist', () => {
    expect(page).toMatch(/v-else-if="!hasRows && !filtered\.length"/)
  })
})

describe('notRecordedReason', () => {
  it('names a mode that is switched off in recorded modes', () => {
    const settings = { recordedModesByGame: { valorant: ['COMPETITIVE', 'PREMIER'] } }
    expect(notRecordedReason('deathmatch', settings)).toEqual({ text: "Deathmatch isn't in your recorded modes", fix: { label: 'Change recorded modes', path: '/settings?tab=recording' } })
  })
  it('stays a "may" when the mode was recorded or unknown', () => {
    const settings = { recordedModesByGame: { valorant: ['COMPETITIVE'] } }
    expect(notRecordedReason('COMPETITIVE', settings).text).toBe('UpForge or OBS may not have been running')
    expect(notRecordedReason(null, settings).text).toBe('UpForge or OBS may not have been running')
    expect(notRecordedReason('DEATHMATCH', null).fix.path).toBe('/settings?tab=recording')
  })
})
