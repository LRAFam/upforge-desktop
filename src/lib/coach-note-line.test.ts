import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { coachNoteLine } from './coach-note-line'
import { applyGameNotes, lolReportView } from './match-report-games'
import { matchReportView } from './match-report'

const quiet = { hasCoachNote: false, recurrence: false, notesCapped: false, waiting: false, failed: false }

describe('coachNoteLine', () => {
  it('says the coach is reading while notes load, never "No coach note"', () => {
    expect(coachNoteLine({ ...quiet, waiting: true })).toBe('loading')
  })
  it('offers a retry when the notes call failed or ran out of time', () => {
    expect(coachNoteLine({ ...quiet, failed: true })).toBe('failed')
  })
  it('shows nothing extra when the coach note is on the page', () => {
    expect(coachNoteLine({ ...quiet, hasCoachNote: true })).toBeNull()
  })
  it('keeps the recurrence and capped lines', () => {
    expect(coachNoteLine({ ...quiet, hasCoachNote: true, recurrence: true })).toBe('recurrence')
    expect(coachNoteLine({ ...quiet, notesCapped: true })).toBe('capped')
  })
  it('says "No coach note" only when nothing is loading or failed', () => {
    expect(coachNoteLine(quiet)).toBe('none')
  })
})

describe('hasCoachNote on report views', () => {
  it('is set when AI notes are applied to a League / CS2 / Deadlock report', () => {
    const base = lolReportView({ match_id: 'EUW1_1', account: { is_main: true }, facts: { won: true } } as never)
    expect(base.hasCoachNote).toBeFalsy()
    const v = applyGameNotes(base, { notes_source: 'ai', notes: { headline: { text: 'You farmed well.' } } })
    expect(v.hasCoachNote).toBe(true)
  })
  it('is set on a Valorant report with a coach headline', () => {
    const v = matchReportView({ match_id: 'm', account: { is_main: true }, report: { facts: {}, notes: { headline: { finding_id: 'x', text: 'Hi' } } } } as never)
    expect(v.hasCoachNote).toBe(true)
  })
})

describe('MatchReportV3 coach line', () => {
  const sfc = readFileSync(new URL('../views/v3/MatchReportV3.vue', import.meta.url), 'utf8')
  it('uses coachNoteLine instead of an unconditional "No coach note"', () => {
    expect(sfc).toMatch(/coachNoteLine\(/)
    expect(sfc).not.toMatch(/<p v-else class="uf-t2">No coach note/)
  })
})
