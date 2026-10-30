import { describe, expect, it } from 'vitest'
import { faceitAttachView } from './cs2-faceit-attach'

describe('faceitAttachView', () => {
  it('offers the action only for a single confident match', () => {
    const v = faceitAttachView({ status: 'matched', match: { match_id: '1-x', map: 'de_mirage', score: '13 — 9' } }, null)
    expect(v).toEqual({ visible: true, canAttach: true, line: expect.stringContaining('on Mirage (13 — 9)') })
  })
  it('explains ambiguity instead of guessing', () => {
    const v = faceitAttachView({ status: 'no_match', reason: 'ambiguous' }, null)
    expect(v.canAttach).toBe(false)
    expect(v.line).toContain("won't guess")
  })
  it('stays hidden when FACEIT is not connected or nothing fits', () => {
    expect(faceitAttachView({ status: 'not_connected' }, null).visible).toBe(false)
    expect(faceitAttachView({ status: 'no_match', reason: 'none_in_window' }, null).visible).toBe(false)
    expect(faceitAttachView(null, null).visible).toBe(false)
  })
  it('remembers a queued match and never offers it twice', () => {
    const v = faceitAttachView({ status: 'matched', match: { match_id: '1-x', map: null } }, { jobId: 'j' })
    expect(v.canAttach).toBe(false)
    expect(v.line).toContain('queued')
  })
})
