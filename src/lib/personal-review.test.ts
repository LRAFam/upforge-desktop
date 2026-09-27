import { expect, it } from 'vitest'
import { validPersonalReview } from './personal-review'
const review = { source: { kind: 'analysis', id: '639', game: 'valorant' }, revision: 1, focus: 'Wait', notes: [{ id: '11111111-1111-4111-8111-111111111111', text: 'Check support', position: 371.25, round: 3, createdAt: '2026-09-27T12:00:00Z' }] }
it('accepts exact media coordinates and an empty initial review', () => {
  expect(validPersonalReview(review)).toBe(true)
  expect(validPersonalReview({ ...review, revision: 0, notes: [], focus: '' })).toBe(true)
})
it('rejects missing identity, invalid timestamps and malformed notes', () => {
  expect(validPersonalReview({ ...review, source: { ...review.source, id: '../private' } })).toBe(false)
  expect(validPersonalReview({ ...review, notes: [{ ...review.notes[0], position: -1 }] })).toBe(false)
  expect(validPersonalReview({ ...review, notes: [{ ...review.notes[0], createdAt: 'not a date' }] })).toBe(false)
  expect(validPersonalReview({ ...review, notes: [{ ...review.notes[0], text: '' }] })).toBe(false)
})
it('validates explicit focus check-ins and same-game carryover', () => {
  const previousFocus = { sourceKey: 'a'.repeat(64), focus: 'Wait for support', source: { kind: 'analysis', id: '638', game: 'valorant' } }
  const focusCheckIn = { sourceKey: previousFocus.sourceKey, focus: previousFocus.focus, outcome: 'practising', reflection: 'Waited twice' }
  expect(validPersonalReview({ ...review, previousFocus, focusCheckIn })).toBe(true)
  expect(validPersonalReview({ ...review, focusCheckIn: { ...focusCheckIn, outcome: 'automatically_improved' } })).toBe(false)
  expect(validPersonalReview({ ...review, previousFocus: { ...previousFocus, source: { ...previousFocus.source, game: 'cs2' } } })).toBe(false)
})
