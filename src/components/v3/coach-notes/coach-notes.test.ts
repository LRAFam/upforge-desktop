import { describe, expect, it, vi } from 'vitest'
import { addNote, clearDraft, clock, emptyDraft, loadDraft, MAX_NOTES, removeNote, saveDraft, submitBlocker, submitDraft, type CoachNotesApi } from './coach-notes'

class MemStorage implements Storage {
  private m = new Map<string, string>()
  get length() { return this.m.size }
  clear() { this.m.clear() }
  getItem(k: string) { return this.m.get(k) ?? null }
  key(i: number) { return [...this.m.keys()][i] ?? null }
  removeItem(k: string) { this.m.delete(k) }
  setItem(k: string, v: string) { this.m.set(k, v) }
}

const at = (sec: number, round: number | null = null) => ({ offsetMs: sec * 1000, round })

describe('coach notes draft', () => {
  it('keeps notes in video order with the time and round they were written at', () => {
    let d = emptyDraft(7)
    d = addNote(d, 'Late rotate to B', at(300, 9)).draft
    d = addNote(d, 'Good opener', at(65, 2)).draft
    expect(d.notes.map(n => [n.body, n.offsetMs, n.round])).toEqual([['Good opener', 65000, 2], ['Late rotate to B', 300000, 9]])
    expect(clock(d.notes[1].offsetMs)).toBe('5:00')
  })

  it('refuses empty, too long and too many notes', () => {
    const d = emptyDraft(7)
    expect(addNote(d, '   ', at(1)).error).toBeTruthy()
    expect(addNote(d, 'x'.repeat(501), at(1)).error).toBeTruthy()
    let full = d
    for (let i = 0; i < MAX_NOTES; i++) full = addNote(full, `n${i}`, at(i)).draft
    expect(addNote(full, 'one more', at(1)).error).toBeTruthy()
  })

  it('autosaves per user and review, survives a reload, and is cleared on submit', () => {
    const s = new MemStorage()
    const d = addNote(emptyDraft(7), 'Note', at(10)).draft
    saveDraft('user-1', d, s)
    expect(loadDraft('user-1', 7, s).notes).toHaveLength(1)
    expect(loadDraft('user-2', 7, s).notes).toHaveLength(0)
    expect(loadDraft('user-1', 8, s).notes).toHaveLength(0)
    clearDraft('user-1', 7, s)
    expect(loadDraft('user-1', 7, s).notes).toHaveLength(0)
  })

  it('ignores a corrupt or tampered draft', () => {
    const s = new MemStorage()
    s.setItem('uf.coachNotes.v1:user-1:7', '{not json')
    expect(loadDraft('user-1', 7, s).notes).toEqual([])
    s.setItem('uf.coachNotes.v1:user-1:7', JSON.stringify({ notes: [{ key: 'a', body: 'ok', offsetMs: -5, round: 99 }, { body: 3 }] }))
    expect(loadDraft('user-1', 7, s).notes).toEqual([{ key: 'a', body: 'ok', offsetMs: null, round: null, postedId: null }])
  })

  it('only removes notes that were not sent yet', () => {
    let d = addNote(emptyDraft(7), 'a', at(1)).draft
    d = { ...d, notes: [{ ...d.notes[0], postedId: 55 }] }
    expect(removeNote(d, d.notes[0].key).notes).toHaveLength(1)
  })

  it('blocks submit until the review has a note (the API requires one)', () => {
    expect(submitBlocker(emptyDraft(7), 0)).toBeTruthy()
    expect(submitBlocker(emptyDraft(7), 2)).toBeNull()
  })
})

describe('submitDraft', () => {
  const api = (fails: Partial<Record<'add' | 'complete', number>> = {}): CoachNotesApi & { calls: string[] } => {
    const calls: string[] = []
    let adds = 0
    return {
      calls,
      addAnnotation: vi.fn(async (_id, note) => {
        adds++
        calls.push(`add:${note.body}`)
        if (fails.add === adds) return { ok: false as const, error: 'Network' }
        return { ok: true as const, id: 100 + adds }
      }),
      completeRosterReview: vi.fn(async (_id, closing) => {
        calls.push(`complete:${closing ?? ''}`)
        if (fails.complete) return { ok: false as const, error: 'Nope' }
        return { ok: true as const }
      }),
    }
  }

  it('posts every note in order, then completes with the closing note', async () => {
    let d = addNote(emptyDraft(7), 'b', at(20)).draft
    d = addNote(d, 'a', at(10)).draft
    d = { ...d, closing: '  Work on trades.  ' }
    const a = api()
    const res = await submitDraft(d, a)
    expect(res).toEqual({ ok: true, sent: 2 })
    expect(a.calls).toEqual(['add:a', 'add:b', 'complete:Work on trades.'])
  })

  it('a failure mid-way keeps what was sent, so the retry never duplicates a note', async () => {
    let d = addNote(emptyDraft(7), 'a', at(10)).draft
    d = addNote(d, 'b', at(20)).draft
    const first = api({ add: 2 })
    const r1 = await submitDraft(d, first)
    expect(r1.ok).toBe(false)
    const kept = (r1 as { draft: typeof d }).draft
    expect(kept.notes.map(n => n.postedId)).toEqual([101, null])
    const retry = api()
    const r2 = await submitDraft(kept, retry)
    expect(r2.ok).toBe(true)
    expect(retry.calls).toEqual(['add:b', 'complete:'])
  })

  it('reports a refused completion without losing the sent state', async () => {
    const d = addNote(emptyDraft(7), 'a', at(10)).draft
    const r = await submitDraft(d, api({ complete: 1 }))
    expect(r.ok).toBe(false)
    expect((r as { draft: typeof d }).draft.notes[0].postedId).toBe(101)
  })
})
