import { describe, expect, it } from 'vitest'
import { reportReadyNotice } from './report-ready-notice'
import type { FocusUpdate } from '../../src/lib/focus'

function latest(over: Partial<FocusUpdate> = {}): FocusUpdate {
  return { match_id: 'match-1', focus: null, focus_event: null, ...over }
}
const base = { reason: 'match_end', postGameShowing: false, announced: new Set<string>() }

describe('reportReadyNotice', () => {
  it('tells the player their report is ready after a match, and opens that report', () => {
    expect(reportReadyNotice({ ...base, latest: latest() })).toEqual({
      matchId: 'match-1',
      title: 'Your match report is ready',
      body: 'See what decided your last match.',
      path: '/report/match-1',
    })
    expect(reportReadyNotice({ ...base, reason: 'match_end_retry', latest: latest() })?.matchId).toBe('match-1')
  })

  it('leads with the coach’s headline when the report has one', () => {
    const notice = reportReadyNotice({
      ...base,
      latest: latest({ report: { notes: { headline: { finding_id: 'opening_deaths', text: '  You died first in 8 rounds\nand won 1 of them. ' } } } }),
    })
    expect(notice?.body).toBe('You died first in 8 rounds and won 1 of them.')
  })

  it('keeps a long headline to one short line', () => {
    const notice = reportReadyNotice({ ...base, latest: latest({ report: { notes: { headline: { finding_id: 'opening_deaths', text: 'word '.repeat(80) } } } }) })
    expect(notice!.body.length).toBeLessThanOrEqual(140)
    expect(notice!.body.endsWith('…')).toBe(true)
  })

  it('stays quiet for syncs that do not follow a match', () => {
    expect(reportReadyNotice({ ...base, reason: 'startup', latest: latest() })).toBeNull()
    expect(reportReadyNotice({ ...base, reason: 'manual', latest: latest() })).toBeNull()
  })

  it('stays quiet when the sync made no new report', () => {
    expect(reportReadyNotice({ ...base, latest: null })).toBeNull()
  })

  it('stays quiet while the after-match window is showing, because it already links the report', () => {
    expect(reportReadyNotice({ ...base, postGameShowing: true, latest: latest() })).toBeNull()
  })

  it('announces each match once', () => {
    expect(reportReadyNotice({ ...base, announced: new Set(['match-1']), latest: latest() })).toBeNull()
  })

  it('never builds a route from an id that is not a plain match id', () => {
    expect(reportReadyNotice({ ...base, latest: latest({ match_id: '../settings?x=1' }) })).toBeNull()
    expect(reportReadyNotice({ ...base, latest: latest({ match_id: '' }) })).toBeNull()
  })
})
