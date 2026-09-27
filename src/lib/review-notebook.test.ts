import { reactive } from 'vue'
import { describe, expect, it } from 'vitest'
import { notebookWriteForIpc, type NotebookWrite, validNotebookContext, type NotebookContext } from './review-notebook'
const context = (): NotebookContext => ({ version: 1, moments: [
  { source: { kind: 'analysis', id: '639', game: 'valorant', label: 'Summit' }, position: 371.25, start: 369, eventShift: -4 },
  { source: { kind: 'recording', id: 'recording-12', game: 'valorant', label: 'Split' }, position: 54.5, start: 52.25, eventShift: 0 },
], linked: true, speed: 0.5, loop: { enabled: true, from: 0, to: 8 } })
describe('saved review coordinates', () => {
  it('round trips independent source positions, alignment and timing adjustments', () => {
    const saved = JSON.parse(JSON.stringify(context()))
    expect(validNotebookContext(saved)).toBe(true)
    expect(saved.moments[0].position - saved.moments[0].start).toBe(2.25)
    expect(saved.moments[1].position - saved.moments[1].start).toBe(2.25)
    expect(saved.moments.map((m: { eventShift: number }) => m.eventShift)).toEqual([-4, 0])
  })
  it('rejects temporary URLs, incompatible games, and invalid coordinates', () => {
    const url = context(); url.moments[0].source.id = 'https://example.com/video?token=secret'
    expect(validNotebookContext(url)).toBe(false)
    const game = context(); game.moments[1].source.game = 'cs2'
    expect(validNotebookContext(game)).toBe(false)
    const time = context(); time.moments[0].position = NaN
    expect(validNotebookContext(time)).toBe(false)
  })
  it('rejects looping with no alignment or an empty range', () => {
    const unlinked = context(); unlinked.linked = false
    expect(validNotebookContext(unlinked)).toBe(false)
    const empty = context(); empty.loop.to = 0
    expect(validNotebookContext(empty)).toBe(false)
  })
})

import { editNotebookNote, checkInFocus, validSavedComparison, type SavedComparison } from './review-notebook'
function comparison(): SavedComparison {
  return { id: '11111111-1111-4111-8111-111111111111', revision: 2, title: 'Entry timing', focus: 'Wait for support', context: context(), updatedAt: '2026-09-27T12:00:00Z', notes: [{ id: 'note-1', text: 'Original note', attachment: 'a', context: context(), createdAt: '2026-09-27T12:00:00Z' }] }
}
describe('notebook follow-up writes', () => {
  it('edits text without moving timestamps, changing attachment or mutating the source', () => {
    const original = comparison()
    const edited = editNotebookNote(original, 'note-1', '  Wait for support  ')!
    expect(edited.notes[0]).toEqual({ ...original.notes[0], text: 'Wait for support' })
    expect(edited.context).toEqual(original.context)
    expect(edited.revision).toBe(2)
    expect(original.notes[0].text).toBe('Original note')
    expect(editNotebookNote(original, 'missing', 'test')).toBeNull()
    expect(editNotebookNote(original, 'note-1', ' ')).toBeNull()
  })
  it('attaches a self-assessment to the exact focus without replacing footage', () => {
    const original = comparison()
    const checked = checkInFocus(original, 'practising', ' Remembered twice ', '2026-09-27T14:00:00Z')!
    expect(checked.focusCheckIn).toEqual({ focus: original.focus, outcome: 'practising', reflection: 'Remembered twice', reviewedAt: '2026-09-27T14:00:00Z' })
    expect(checked.notes).toEqual(original.notes)
    expect(checked.context).toEqual(original.context)
    expect(validSavedComparison({ ...original, ...checked })).toBe(true)
    expect(validSavedComparison({ ...original, ...checked, focus: 'Different goal' })).toBe(false)
    expect(checkInFocus({ ...original, focus: '' }, 'improved', '', '2026-09-27T14:00:00Z')).toBeNull()
  })
})

import { relinkNotebook } from './review-notebook'
describe('explicit footage relinking', () => {
  it('replaces matching source references in the comparison and notes without moving moments', () => {
    const item = comparison()
    const from = item.context.moments[0].source
    const to = { ...from, kind: 'recording' as const, id: 'replacement-full-video' }
    const changed = relinkNotebook(item, [{ from, to }])!
    expect(changed.context.moments[0]).toEqual({ ...item.context.moments[0], source: to })
    expect(changed.notes[0].context.moments[0]).toEqual({ ...item.notes[0].context.moments[0], source: to })
    expect(changed.context.moments[1]).toEqual(item.context.moments[1])
    expect(changed.notes[0].text).toBe(item.notes[0].text)
    expect(item.context.moments[0].source.id).toBe('639')
    expect(changed.revision).toBe(item.revision)
  })
  it('rejects a different game or invalid source identity', () => {
    const item = comparison(); const from = item.context.moments[0].source
    expect(relinkNotebook(item, [{ from, to: { ...from, game: 'cs2' } }])).toBeNull()
    expect(relinkNotebook(item, [{ from, to: { ...from, id: 'https://signed-video' } }])).toBeNull()
  })
})


describe('notebook IPC serialization', () => {
  it('can resave a reopened comparison with nested reactive notes and a check-in', () => {
    const document = reactive<NotebookWrite>({ revision: 2, title: 'Two duels', focus: 'Wait for support', context: context(),
      notes: [{ id: '11111111-1111-4111-8111-111111111111', text: 'Check cover', attachment: 'both', context: context(), createdAt: '2026-09-27T14:00:00Z' }],
      focusCheckIn: { focus: 'Wait for support', outcome: 'practising', reflection: 'Review both setups', reviewedAt: '2026-09-27T14:00:00Z' },
    })
    expect(() => structuredClone({ ...document, notes: [...document.notes] })).toThrow()
    const sent = structuredClone(notebookWriteForIpc(document))
    expect(sent).toEqual(document)
    sent.notes[0].text = 'Edited note'
    expect(document.notes[0].text).toBe('Check cover')
  })
})
