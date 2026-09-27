/** Durable coordinates are recording media seconds, never temporary playback URLs. */
export interface NotebookSource {
  kind: 'recording' | 'analysis'
  id: string
  game: string
  label: string
}
export interface NotebookMoment {
  source: NotebookSource
  position: number
  start: number
  eventShift: number
}
export interface NotebookContext {
  version: 1
  moments: [NotebookMoment, NotebookMoment]
  linked: boolean
  speed: number
  loop: { enabled: boolean; from: number; to: number }
}
export interface NotebookNote {
  id: string
  text: string
  attachment: 'a' | 'b' | 'both'
  context: NotebookContext
  createdAt: string
}
export interface FocusCheckIn {
  focus: string
  outcome: 'improved' | 'practising' | 'not_tried'
  reflection: string
  reviewedAt: string
}
export interface SavedComparison {
  focusCheckIn?: FocusCheckIn | null
  revision: number
  id: string
  title: string
  context: NotebookContext
  notes: NotebookNote[]
  focus: string
  updatedAt: string
}

export function validNotebookContext(value: unknown): value is NotebookContext {
  if (!value || typeof value !== 'object') return false
  const c = value as NotebookContext
  const seconds = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 86400
  if (c.version !== 1 || !Array.isArray(c.moments) || c.moments.length !== 2) return false
  if (!c.moments.every(m => m && m.source
    && ['recording', 'analysis'].includes(m.source.kind)
    && typeof m.source.id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(m.source.id)
    && (m.source.kind !== 'analysis' || /^[1-9][0-9]*$/.test(m.source.id))
    && typeof m.source.game === 'string' && m.source.game.length > 0 && m.source.game.length <= 32
    && typeof m.source.label === 'string' && m.source.label.length <= 180
    && seconds(m.position) && seconds(m.start)
    && typeof m.eventShift === 'number' && Number.isFinite(m.eventShift) && Math.abs(m.eventShift) <= 120)) return false
  return c.moments[0].source.game === c.moments[1].source.game
    && typeof c.linked === 'boolean' && [0.25, 0.5, 1, 1.5, 2].includes(c.speed)
    && !!c.loop && typeof c.loop.enabled === 'boolean' && seconds(c.loop.from) && seconds(c.loop.to)
    && (!c.loop.enabled || (c.linked && c.loop.to > c.loop.from))
}

export type NotebookResult<T> = { ok: true; data: T } | { ok: false; error: string }
export type NotebookWrite = Omit<SavedComparison, 'id' | 'updatedAt'>

// Notebook documents use a JSON contract. Detach nested Vue proxies before
// crossing Electron's structured-clone boundary, including existing notes.
export function notebookWriteForIpc(document: NotebookWrite): NotebookWrite {
  return JSON.parse(JSON.stringify(document)) as NotebookWrite
}

export function validSavedComparison(value: unknown): value is SavedComparison {
  if (!value || typeof value !== 'object') return false
  const item = value as SavedComparison
  return typeof item.id === 'string' && /^[0-9a-f-]{36}$/i.test(item.id)
    && Number.isInteger(item.revision) && item.revision > 0
    && typeof item.title === 'string' && item.title.length <= 120
    && typeof item.focus === 'string' && item.focus.length <= 200
    && (item.focusCheckIn == null || (validFocusCheckIn(item.focusCheckIn) && item.focusCheckIn.focus === item.focus))
    && validNotebookContext(item.context) && typeof item.updatedAt === 'string'
    && Array.isArray(item.notes) && item.notes.length <= 200 && item.notes.every(note =>
      note && typeof note.id === 'string' && typeof note.text === 'string' && note.text.length <= 2000
      && ['a', 'b', 'both'].includes(note.attachment) && typeof note.createdAt === 'string'
      && validNotebookContext(note.context))
}

export function validFocusCheckIn(value: unknown): value is FocusCheckIn {
  if (!value || typeof value !== 'object') return false
  const v = value as FocusCheckIn
  return typeof v.focus === 'string' && v.focus.length > 0 && v.focus.length <= 200
    && ['improved', 'practising', 'not_tried'].includes(v.outcome)
    && typeof v.reflection === 'string' && v.reflection.length <= 1000
    && typeof v.reviewedAt === 'string' && Number.isFinite(Date.parse(v.reviewedAt))
}

/** Text edits must never recapture footage or move a saved note's anchors. */
export function editNotebookNote(item: SavedComparison, noteId: string, text: string): NotebookWrite | null {
  const trimmed = text.trim()
  if (!trimmed || trimmed.length > 2000 || !item.notes.some(n => n.id === noteId)) return null
  const { id: _id, updatedAt: _updatedAt, ...document } = item
  return { ...document, notes: item.notes.map(note => note.id === noteId ? { ...note, text: trimmed } : note) }
}

export function checkInFocus(item: SavedComparison, outcome: FocusCheckIn['outcome'], reflection: string, reviewedAt: string): NotebookWrite | null {
  const checkIn = { focus: item.focus, outcome, reflection: reflection.trim(), reviewedAt }
  if (!validFocusCheckIn(checkIn)) return null
  const { id: _id, updatedAt: _updatedAt, ...document } = item
  return { ...document, focusCheckIn: checkIn }
}

export interface NotebookRelink { from: NotebookSource; to: NotebookSource }
export function sameNotebookSource(a: NotebookSource, b: NotebookSource): boolean {
  return a.kind === b.kind && a.id === b.id && a.game === b.game
}
export function relinkNotebookContext(context: NotebookContext, changes: NotebookRelink[]): NotebookContext {
  return { ...context, moments: context.moments.map(moment => {
    const replacement = changes.find(change => sameNotebookSource(change.from, moment.source))
    return replacement ? { ...moment, source: { ...replacement.to } } : moment
  }) as [NotebookMoment, NotebookMoment] }
}
/** Change references only; never infer an offset for different or trimmed footage. */
export function relinkNotebook(item: SavedComparison, changes: NotebookRelink[]): NotebookWrite | null {
  if (!changes.length || changes.some(change => change.from.game !== change.to.game)) return null
  const context = relinkNotebookContext(item.context, changes)
  const notes = item.notes.map(note => ({ ...note, context: relinkNotebookContext(note.context, changes) }))
  if (!validNotebookContext(context) || notes.some(note => !validNotebookContext(note.context))) return null
  const { id: _id, updatedAt: _updatedAt, ...document } = item
  return { ...document, context, notes }
}
