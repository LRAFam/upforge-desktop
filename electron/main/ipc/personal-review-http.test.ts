import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import axios from 'axios'
import { expect, it } from 'vitest'
import type { IpcMain } from 'electron'
import type { AuthManager } from '../auth-manager'
import { setupReviewNotebookHandlers } from './review-notebook-ipc'
import { validPersonalReview, type PersonalReview } from '../../../src/lib/personal-review'
import type { NotebookResult } from '../../../src/lib/review-notebook'
const fixture = process.env.NOTEBOOK_HTTP_TEST_TOKENS
// Only a disposable local Laravel server; fixture tokens are never printed.
it.skipIf(!fixture)('saves a focus, carries it to another review and reopens its account-owned check-in', async () => {
  const tokens: string[] = JSON.parse(readFileSync(fixture!, 'utf8'))
  let owner = 0
  const api = () => axios.create({ baseURL: 'http://127.0.0.1:18089', proxy: false, timeout: 5000, headers: { Authorization: `Bearer ${tokens[owner]}`, Accept: 'application/json' } })
  const handlers = new Map<string, (...args: any[]) => Promise<NotebookResult<PersonalReview>>>()
  setupReviewNotebookHandlers({ handle: (name: string, handler: any) => handlers.set(name, handler) } as unknown as IpcMain,
    { getToken: () => tokens[owner], getUser: () => ({ id: owner + 1 }), getApi: api } as unknown as AuthManager)
  const invoke = async (action: string, body: unknown) => {
    const response = await handlers.get(`personal-review:${action}`)!({}, body)
    if (!response.ok) throw new Error(response.error)
    expect(validPersonalReview(response.data)).toBe(true)
    return response.data
  }
  const source = { kind: 'recording' as const, id: `fixture-${randomUUID()}`, game: 'valorant' }
  const initial = await invoke('get', source)
  expect(initial.revision).toBe(0)
  const first = await invoke('save', { ...initial, focus: 'Wait for support', notes: [{ id: randomUUID(), text: 'Check the angle first', position: 371.25, round: 3, createdAt: new Date().toISOString() }] })
  expect(first.notes[0].position).toBe(371.25)
  const secondSource = { ...source, id: `${source.id}-next` }
  const second = await invoke('get', secondSource)
  expect(second.previousFocus?.focus).toBe(first.focus)
  const document = { ...second, focus: first.focus, focusCheckIn: { sourceKey: second.previousFocus!.sourceKey, focus: first.focus, outcome: 'practising', reflection: 'Waited for support twice' } }
  const saved = await invoke('save', document)
  expect((await invoke('save', document)).revision).toBe(saved.revision)
  const reopened = await invoke('get', secondSource)
  expect(reopened.focusCheckIn).toEqual(document.focusCheckIn)
  owner = 1
  const privateReview = await invoke('get', secondSource)
  expect(privateReview.notes).toEqual([])
  expect(privateReview.focusCheckIn).toBeUndefined()
  expect(privateReview.previousFocus).toBeNull()
  owner = 0
  expect((await invoke('get', source)).notes[0].position).toBe(371.25)
})
