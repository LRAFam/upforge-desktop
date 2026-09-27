import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import axios from 'axios'
import { expect, it } from 'vitest'
import type { IpcMain } from 'electron'
import type { AuthManager } from '../auth-manager'
import { setupReviewNotebookHandlers } from './review-notebook-ipc'
import { validSavedComparison, type NotebookWrite, type SavedComparison, type NotebookResult } from '../../../src/lib/review-notebook'
import { resolveNotebookFootage } from '../../../src/lib/review-recovery'

// Opt-in: requires a disposable local Laravel API, never a production destination.
const fixture = process.env.NOTEBOOK_HTTP_TEST_TOKENS
it.skipIf(!fixture)('round trips desktop notebook requests through the local Laravel API', async () => {
  const tokens: string[] = JSON.parse(readFileSync(fixture!, 'utf8'))
  let owner = 0
  const api = () => axios.create({ baseURL: 'http://127.0.0.1:18089', timeout: 5000, proxy: false,
    headers: { Authorization: `Bearer ${tokens[owner]}`, Accept: 'application/json' } })
  const handlers = new Map<string, (...args: unknown[]) => Promise<NotebookResult<any>>>()
  setupReviewNotebookHandlers({ handle: (name: string, handler: any) => handlers.set(name, handler) } as unknown as IpcMain,
    { getToken: () => tokens[owner], getUser: () => ({ id: owner + 1 }), getApi: api } as unknown as AuthManager)
  const invoke = (action: string, ...args: unknown[]) => handlers.get(`review-notebook:${action}`)!({}, ...args)
  const source = { kind: 'recording' as const, id: `fixture-${randomUUID()}`, game: 'valorant', label: 'Local test footage' }
  const context: NotebookWrite['context'] = { version: 1, moments: [
    { source, position: 371.25, start: 369, eventShift: -4 },
    { source: { ...source, id: `${source.id}-b` }, position: 54.5, start: 52.25, eventShift: 0 },
  ], linked: true, speed: 0.5, loop: { enabled: true, from: 0, to: 8 } }
  const id = randomUUID()
  let revision = 0
  try {
    const doc: NotebookWrite = { revision: 0, title: 'Disposable integration check', focus: 'Wait for support', context,
      notes: [{ id: randomUUID(), text: 'Compare both entries', attachment: 'both', context, createdAt: new Date().toISOString() }] }
    const saved = await invoke('save', id, doc)
    expect(saved.ok).toBe(true)
    if (!saved.ok) throw new Error(saved.error)
    revision = saved.data.revision
    expect(validSavedComparison(saved.data)).toBe(true)
    const listed = await invoke('list')
    expect(listed.ok).toBe(true)
    if (!listed.ok) throw new Error(listed.error)
    const reopened = listed.data.items.find((item: SavedComparison) => item.id === id) as SavedComparison
    expect(reopened.context).toEqual(context)
    expect(reopened.notes[0].context).toEqual(context)
    // Source resolution is deliberately stubbed: this verifies durable references,
    // not real video playback or an authenticated media endpoint.
    const resolved = await resolveNotebookFootage(reopened.context, 'both', async ref => ({ game: ref.game, videoPath: `test://${ref.id}` }))
    expect(resolved.failed).toEqual([])
    expect(resolved.loaded.map(entry => entry.key)).toEqual(context.moments.map(m => `recording:${m.source.id}`))
    owner = 1
    const privateList = await invoke('list')
    expect(privateList.ok && privateList.data.items.some((item: SavedComparison) => item.id === id)).toBe(false)
    expect((await invoke('remove', id, revision)).ok).toBe(false)
    owner = 0
    expect((await invoke('remove', id, revision + 1)).ok).toBe(false)
    const edited = await invoke('save', id, { ...doc, revision, notes: [] })
    expect(edited.ok).toBe(true)
    if (!edited.ok) throw new Error(edited.error)
    revision = edited.data.revision
    expect(edited.data.context).toEqual(context)
    expect(edited.data.notes).toEqual([])
    expect(await invoke('remove', id, revision)).toEqual({ ok: true, data: { id, deleted: true } })
    revision = 0
    const finalList = await invoke('list')
    expect(finalList.ok).toBe(true)
    expect(finalList.ok && finalList.data.items.some((item: SavedComparison) => item.id === id)).toBe(false)
    expect((await invoke('save', id, { ...doc, revision: 2 })).ok).toBe(false)
  } finally {
    owner = 0
    if (revision) await invoke('remove', id, revision)
  }
})
