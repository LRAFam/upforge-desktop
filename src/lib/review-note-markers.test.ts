import { expect, it } from 'vitest'
import { reviewNoteMarkers, groupReviewNoteMarkers } from './review-note-markers'
import type { SavedComparison, NotebookSource } from './review-notebook'
const source: NotebookSource = { kind: 'analysis', id: '639', game: 'valorant', label: 'Summit' }
function item(attachment: 'a' | 'b' | 'both' = 'both'): SavedComparison {
  const context = { version: 1 as const, moments: [
    { source, position: 30, start: 28, eventShift: -4 },
    { source, position: 90, start: 88, eventShift: -4 },
  ] as SavedComparison['context']['moments'], linked: false, speed: 1, loop: { enabled: false, from: 0, to: 8 } }
  return { id: 'comparison', title: 'Entry', revision: 1, focus: '', updatedAt: '2026-09-27', context, notes: [{ id: 'note', text: 'Wait for support', attachment, context, createdAt: '2026-09-27' }] }
}
it('uses saved media positions without applying event correction again', () => {
  const markers = reviewNoteMarkers([item()], source, 100)
  expect(markers.map(m => [m.side, m.seconds])).toEqual([[0, 30], [1, 90]])
  expect(markers[0].note.attachment).toBe('both')
})
it('honours attachment, exact source identity and available duration', () => {
  expect(reviewNoteMarkers([item('b')], source, 100).map(m => m.seconds)).toEqual([90])
  expect(reviewNoteMarkers([item()], { ...source, kind: 'recording' }, 100)).toEqual([])
  expect(reviewNoteMarkers([item()], { ...source, game: 'cs2' }, 100)).toEqual([])
  expect(reviewNoteMarkers([item()], source, 60).map(m => m.seconds)).toEqual([30])
  expect(reviewNoteMarkers([item()], source, 0)).toEqual([])
})
it('keeps dense markers selectable as panel width changes', () => {
  const markers = reviewNoteMarkers([item()], source, 100)
  expect(groupReviewNoteMarkers(markers, 100, 30)).toHaveLength(1)
  expect(groupReviewNoteMarkers(markers, 100, 300)).toHaveLength(2)
  expect(groupReviewNoteMarkers(markers, 100, 0)).toEqual([])
  const grouped = groupReviewNoteMarkers([markers[0], { ...markers[0], key: 'second', seconds: 31 }], 100, 300)
  expect(grouped[0].markers.map(m => m.key)).toEqual([markers[0].key, 'second'])
})
