/**
 * Coach notes (desktop, UI v3): a coach drafts timestamped notes on a student's match, then submits.
 * Drafts live on this PC (per signed-in user + review) until submit, so nothing is lost on a crash.
 * Submit posts each unsent note once (remembering the server id), then completes the roster review.
 */

export const NOTE_MAX = 500 // API: body max:500
export const CLOSING_MAX = 1000 // API: closing_note max:1000
export const MAX_NOTES = 60 // numeric cap on one draft

export interface DraftNote {
  key: string
  body: string
  offsetMs: number | null
  round: number | null
  /** Server annotation id once posted; a retry never posts it again. */
  postedId?: number | null
}

export interface CoachNotesDraft {
  reviewId: number
  notes: DraftNote[]
  closing: string
  updatedAt: number
}

const PREFIX = 'uf.coachNotes.v1:'
const keyFor = (scope: string, reviewId: number) => `${PREFIX}${scope}:${reviewId}`

function safeStorage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null }
}

export function emptyDraft(reviewId: number): CoachNotesDraft {
  return { reviewId, notes: [], closing: '', updatedAt: 0 }
}

function cleanNote(raw: unknown): DraftNote | null {
  const n = raw as Partial<DraftNote> | null
  if (!n || typeof n.key !== 'string' || typeof n.body !== 'string') return null
  const offset = typeof n.offsetMs === 'number' && Number.isFinite(n.offsetMs) && n.offsetMs >= 0 ? Math.round(n.offsetMs) : null
  const round = typeof n.round === 'number' && Number.isInteger(n.round) && n.round >= 1 && n.round <= 50 ? n.round : null
  const posted = typeof n.postedId === 'number' && Number.isInteger(n.postedId) ? n.postedId : null
  return { key: n.key.slice(0, 40), body: n.body.slice(0, NOTE_MAX), offsetMs: offset, round, postedId: posted }
}

export function loadDraft(scope: string, reviewId: number, storage: Storage | null = safeStorage()): CoachNotesDraft {
  try {
    const raw = storage?.getItem(keyFor(scope, reviewId))
    if (!raw) return emptyDraft(reviewId)
    const parsed = JSON.parse(raw) as Partial<CoachNotesDraft>
    const notes = Array.isArray(parsed.notes) ? parsed.notes.map(cleanNote).filter((n): n is DraftNote => !!n).slice(0, MAX_NOTES) : []
    const closing = typeof parsed.closing === 'string' ? parsed.closing.slice(0, CLOSING_MAX) : ''
    return { reviewId, notes, closing, updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0 }
  } catch {
    return emptyDraft(reviewId)
  }
}

export function saveDraft(scope: string, draft: CoachNotesDraft, storage: Storage | null = safeStorage(), now = Date.now()): boolean {
  try {
    if (!storage) return false
    const empty = !draft.notes.length && !draft.closing.trim()
    if (empty) { storage.removeItem(keyFor(scope, draft.reviewId)); return true }
    storage.setItem(keyFor(scope, draft.reviewId), JSON.stringify({ ...draft, updatedAt: now }))
    return true
  } catch {
    return false
  }
}

export function clearDraft(scope: string, reviewId: number, storage: Storage | null = safeStorage()): void {
  try { storage?.removeItem(keyFor(scope, reviewId)) } catch { /* ignore */ }
}

let seq = 0
export function addNote(draft: CoachNotesDraft, body: string, at: { offsetMs: number | null; round: number | null }): { draft: CoachNotesDraft; error?: string } {
  const text = body.trim()
  if (!text) return { draft, error: 'Write the note first.' }
  if (text.length > NOTE_MAX) return { draft, error: `Keep a note under ${NOTE_MAX} characters.` }
  if (draft.notes.length >= MAX_NOTES) return { draft, error: `A review can hold up to ${MAX_NOTES} notes.` }
  const note: DraftNote = {
    key: `n${Date.now().toString(36)}${(seq++).toString(36)}`,
    body: text,
    offsetMs: at.offsetMs != null && at.offsetMs >= 0 ? Math.round(at.offsetMs) : null,
    round: at.round != null && Number.isInteger(at.round) && at.round >= 1 && at.round <= 50 ? at.round : null,
    postedId: null,
  }
  const notes = [...draft.notes, note].sort((a, b) => (a.offsetMs ?? Infinity) - (b.offsetMs ?? Infinity))
  return { draft: { ...draft, notes } }
}

/** Only unsent notes can be removed here; sent ones are already on the student's timeline. */
export function removeNote(draft: CoachNotesDraft, key: string): CoachNotesDraft {
  return { ...draft, notes: draft.notes.filter(n => n.key !== key || n.postedId != null) }
}

export function clock(ms: number | null): string {
  if (ms == null) return '—'
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Why submit is blocked, or null when it can go. The API needs at least one note on the review. */
export function submitBlocker(draft: CoachNotesDraft, alreadyOnServer: number): string | null {
  if (draft.notes.length + alreadyOnServer < 1) return 'Add at least one note on the timeline first.'
  if (draft.closing.length > CLOSING_MAX) return `Keep the closing note under ${CLOSING_MAX.toLocaleString('en-GB')} characters.`
  return null
}

export interface CoachNotesApi {
  addAnnotation: (reviewId: number, note: { body: string; roundNumber?: number | null; videoOffsetMs?: number | null }) => Promise<{ ok: true; id: number | null } | { ok: false; error: string }>
  completeRosterReview: (reviewId: number, closingNote?: string | null) => Promise<{ ok: true } | { ok: false; error: string }>
}

/**
 * Post unsent notes in time order, saving progress after each, then complete the review.
 * On any failure it stops and returns the draft with what was sent marked, so a retry
 * never duplicates a note. `onProgress` lets the caller persist the draft after every post.
 */
export async function submitDraft(
  draft: CoachNotesDraft,
  api: CoachNotesApi,
  onProgress?: (d: CoachNotesDraft) => void,
): Promise<{ ok: true; sent: number } | { ok: false; error: string; draft: CoachNotesDraft }> {
  let current = draft
  let sent = 0
  for (const note of draft.notes) {
    if (note.postedId != null) continue
    const res = await api.addAnnotation(draft.reviewId, { body: note.body, roundNumber: note.round, videoOffsetMs: note.offsetMs })
    if (!res.ok) return { ok: false, error: res.error, draft: current }
    // A null id still means the server accepted it; -1 marks "sent, id unknown" so it isn't re-sent.
    current = { ...current, notes: current.notes.map(n => (n.key === note.key ? { ...n, postedId: res.id ?? -1 } : n)) }
    sent++
    onProgress?.(current)
  }
  const done = await api.completeRosterReview(draft.reviewId, current.closing.trim() || null)
  if (!done.ok) return { ok: false, error: done.error, draft: current }
  return { ok: true, sent }
}
