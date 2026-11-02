import { describe, expect, it } from 'vitest'
import type { DuelMoment } from '../../lib/duel-moments'
import { categoryScore, clipNote, extraCoachNotes, mechanicsLine, momentsToWatch, moreDetailSummary } from './review-panel'

const m = (id: string, round: number, extra: Partial<DuelMoment> = {}): DuelMoment => ({
  moment_id: id, round, video_offset_ms: round * 1000, window_start_ms: 0, window_end_ms: 1, callout: null, isolated: false,
  trigger: 'player_death', ...extra,
})

describe('momentsToWatch', () => {
  it('picks observed lost duels with a fix, clear clips first, in match order', () => {
    const list = [
      m('a', 1, { key_observation: 'obs', player_fix: 'fix', confidence: 'low' }),
      m('b', 3, { key_observation: 'obs', trigger: 'player_kill', polarity: 'positive' }),
      m('c', 5, { key_observation: 'obs', player_fix: 'fix', confidence: 'high' }),
      m('d', 7),
      m('e', 9, { key_observation: 'obs', player_fix: 'fix', confidence: 'high', weight: 80 }),
    ]
    const { watch, rest } = momentsToWatch(list)
    expect(watch.map(x => x.moment_id)).toEqual(['c', 'e'])
    expect(rest.map(x => x.moment_id)).toEqual(['a', 'b', 'd'])
  })
  it('returns nothing to watch when no moment has an observation', () => {
    const { watch, rest } = momentsToWatch([m('a', 1), m('b', 2)])
    expect(watch).toEqual([])
    expect(rest).toHaveLength(2)
  })
})

describe('confidence wording stays internal', () => {
  it('drops confidence labels and low/unknown mechanics', () => {
    const line = mechanicsLine(m('a', 1, {
      peek_sequence: 'dry_peek', crosshair_on_commit: 'head', movement_on_commit: 'stationary',
      mechanics_confidence: { peek: 'high', crosshair: 'high', movement: 'low' },
    }))
    expect(line).toBe('Peek: dry peek · Crosshair: head')
    expect(line).not.toMatch(/high|medium|low/)
    expect(mechanicsLine(m('b', 1, { peek_sequence: 'unknown', mechanics_confidence: { peek: 'low' } }))).toBeNull()
  })
  it('translates a low-confidence or obscured clip into one plain line', () => {
    expect(clipNote(m('a', 1, { confidence: 'high' }))).toBeNull()
    expect(clipNote(m('a', 1, { confidence: 'medium' }))).toBeNull()
    expect(clipNote(m('a', 1, { confidence: 'low' }))).toMatch(/^Hard to see/)
    expect(clipNote(m('a', 1, { player_action_visibility: 'obscured' }))).toMatch(/^Hard to see/)
  })
})

describe('categoryScore', () => {
  it('shows AI category scores as coach ratings out of 10, never out of 1000', () => {
    expect(categoryScore(7)).toMatchObject({ kind: 'coach', text: '7/10', caption: 'Coach rating' })
    expect(categoryScore(72)?.text).toBe('7.2/10')
    expect(categoryScore(null)).toBeNull()
  })
})

describe('More detail', () => {
  it('drops the note the header already shows', () => {
    expect(extraCoachNotes(['Verdict here.', 'Other'], { verdict: 'Verdict here.' })).toEqual(['Other'])
  })
  it('summarises what is folded', () => {
    expect(moreDetailSummary({ summary: 'x' }, 9, 0)).toEqual({ count: 10, summary: 'Full review · 9 more moments' })
    expect(moreDetailSummary(null, 0, 1)).toEqual({ count: 1, summary: '1 more note' })
    expect(moreDetailSummary(null, 0, 0).count).toBe(0)
  })
})
