/**
 * Match a desktop CS2 recording to the player's FACEIT match, then (only on a user tap)
 * queue that match on the existing server FACEIT path (POST /api/cs2/faceit/analyze), which
 * downloads the FACEIT demo server-side and coaches the right player.
 *
 * Uses existing API endpoints only:
 *   GET  /api/cs2/faceit/connection        → is FACEIT connected, which nickname
 *   GET  /api/cs2/faceit/matches?username= → last 10 FACEIT CS2 matches (map + finished_at)
 *   POST /api/cs2/faceit/analyze {match_id} → queue analysis (uses 1 analysis from the plan)
 *
 * Matching is conservative, like pickValveMatchForSession: exactly one FACEIT match must fit the
 * recording's time window and map, otherwise we don't guess.
 */
import fs from 'node:fs'
import path from 'node:path'
import { isTrustedRendererUrl } from './renderer-trust'

export interface FaceitMatchSummary {
  match_id: string
  map: string | null
  finished_at: number | null // unix seconds
  score?: string | null
  result?: string | null
}

export interface RecordingWindow {
  /** When the recording started (ms). */
  startedAtMs: number
  /** When the recording ended (ms), if known. */
  endedAtMs?: number | null
  map?: string | null
}

export type FaceitMatchLookup =
  | { status: 'matched'; match: FaceitMatchSummary }
  | { status: 'not_connected' }
  | { status: 'no_match'; reason: 'none_in_window' | 'ambiguous' | 'no_history' }
  | { status: 'error'; message: string }

/** A FACEIT match id looks like 1-<uuid>; anything else is refused before it reaches the API. */
export const FACEIT_MATCH_ID = /^1-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const MIN_MATCH_SEC = 5 * 60
const MAX_MATCH_SEC = 90 * 60
const END_TOLERANCE_SEC = 10 * 60

export function normalizeCs2Map(map: string | null | undefined): string | null {
  if (!map) return null
  const m = map.trim().toLowerCase()
  if (!m || m === 'menu') return null
  return m.startsWith('de_') || m.startsWith('cs_') ? m : `de_${m}`
}

/** Pick the one FACEIT match that fits a recording (time + map), or null when none/several fit. */
export function pickFaceitMatchForRecording(
  matches: FaceitMatchSummary[],
  rec: RecordingWindow,
): { match: FaceitMatchSummary | null; reason?: 'none_in_window' | 'ambiguous' } {
  if (!Number.isFinite(rec.startedAtMs) || rec.startedAtMs <= 0) return { match: null, reason: 'none_in_window' }
  const startSec = rec.startedAtMs / 1000
  const endSec = rec.endedAtMs && Number.isFinite(rec.endedAtMs) && rec.endedAtMs > rec.startedAtMs ? rec.endedAtMs / 1000 : null
  const wanted = normalizeCs2Map(rec.map)
  const fits = matches.filter((m) => {
    if (typeof m.finished_at !== 'number' || !Number.isFinite(m.finished_at)) return false
    const timeOk = endSec !== null
      ? Math.abs(m.finished_at - endSec) <= END_TOLERANCE_SEC
      : m.finished_at - startSec >= MIN_MATCH_SEC && m.finished_at - startSec <= MAX_MATCH_SEC
    if (!timeOk) return false
    const theirs = normalizeCs2Map(m.map)
    // When the recording knows its map, FACEIT's map must be known and equal.
    return wanted ? theirs === wanted : true
  })
  if (fits.length === 1) return { match: fits[0]! }
  return { match: null, reason: fits.length ? 'ambiguous' : 'none_in_window' }
}

export interface FaceitApi {
  get: (url: string, config?: { params?: Record<string, unknown> }) => Promise<{ data: unknown }>
  post: (url: string, body: unknown) => Promise<{ data: unknown }>
}

function asMatches(data: unknown): FaceitMatchSummary[] {
  const rows = (data as { matches?: unknown })?.matches
  if (!Array.isArray(rows)) return []
  return rows.flatMap((r) => {
    const row = r as Record<string, unknown>
    if (typeof row.match_id !== 'string') return []
    const finished = typeof row.finished_at === 'number' ? row.finished_at : Number(row.finished_at)
    return [{
      match_id: row.match_id,
      map: typeof row.map === 'string' ? row.map : null,
      finished_at: Number.isFinite(finished) ? finished : null,
      score: typeof row.score === 'string' ? row.score : null,
      result: typeof row.result === 'string' ? row.result : null,
    }]
  })
}

export async function findFaceitMatchForRecording(api: FaceitApi | null, rec: RecordingWindow): Promise<FaceitMatchLookup> {
  if (!api) return { status: 'not_connected' }
  try {
    const conn = (await api.get('/api/cs2/faceit/connection')).data as { connected?: boolean; nickname?: string } | null
    if (!conn?.connected || !conn.nickname) return { status: 'not_connected' }
    const list = asMatches((await api.get('/api/cs2/faceit/matches', { params: { username: conn.nickname } })).data)
    if (!list.length) return { status: 'no_match', reason: 'no_history' }
    const { match, reason } = pickFaceitMatchForRecording(list, rec)
    return match ? { status: 'matched', match } : { status: 'no_match', reason: reason ?? 'none_in_window' }
  } catch (e) {
    return { status: 'error', message: errorMessage(e, 'Could not load your FACEIT matches.') }
  }
}

export async function queueFaceitMatch(
  api: FaceitApi | null,
  matchId: string,
): Promise<{ ok: true; jobId: string } | { ok: false; error: string }> {
  if (!api) return { ok: false, error: 'Not signed in' }
  if (!FACEIT_MATCH_ID.test(matchId)) return { ok: false, error: 'Invalid FACEIT match id' }
  try {
    const data = (await api.post('/api/cs2/faceit/analyze', { match_id: matchId })).data as { job_id?: unknown }
    return typeof data?.job_id === 'string' ? { ok: true, jobId: data.job_id } : { ok: false, error: 'FACEIT coaching could not be started.' }
  } catch (e) {
    return { ok: false, error: errorMessage(e, 'FACEIT coaching could not be started.') }
  }
}

function errorMessage(e: unknown, fallback: string): string {
  const data = (e as { response?: { data?: { message?: unknown; error?: unknown } } })?.response?.data
  const msg = typeof data?.message === 'string' ? data.message : typeof data?.error === 'string' ? data.error : null
  return msg || fallback
}

/** recordingId → queued FACEIT match, so the match page remembers the tap. Stored in userData. */
export interface FaceitLink { matchId: string; jobId: string; linkedAt: number }

export class FaceitLinkStore {
  private readonly file: string
  constructor(dir: string) { this.file = path.join(dir, 'cs2-faceit-links.json') }

  private read(): Record<string, FaceitLink> {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8')) as unknown
      return raw && typeof raw === 'object' ? (raw as Record<string, FaceitLink>) : {}
    } catch { return {} }
  }

  get(recordingId: string): FaceitLink | null {
    const link = this.read()[recordingId]
    return link && typeof link.matchId === 'string' && typeof link.jobId === 'string' ? link : null
  }

  set(recordingId: string, link: FaceitLink): void {
    const all = this.read()
    all[recordingId] = link
    // Bounded: keep the newest 200 links.
    const kept = Object.entries(all).sort((a, b) => b[1].linkedAt - a[1].linkedAt).slice(0, 200)
    fs.mkdirSync(path.dirname(this.file), { recursive: true })
    fs.writeFileSync(this.file, JSON.stringify(Object.fromEntries(kept)))
  }
}

interface IpcLike { handle: (channel: string, fn: (event: unknown, ...args: unknown[]) => unknown) => void }

/** Registers cs2:find-faceit-match, cs2:attach-faceit-match and cs2:get-faceit-link. */
export function registerCs2FaceitMatchIpc(
  ipc: IpcLike,
  getApi: () => FaceitApi | null,
  links: FaceitLinkStore,
): void {
  ipc.handle('cs2:find-faceit-match', (_e, rec) => {
    const r = (rec ?? {}) as Partial<RecordingWindow>
    return findFaceitMatchForRecording(getApi(), {
      startedAtMs: Number(r.startedAtMs),
      endedAtMs: r.endedAtMs == null ? null : Number(r.endedAtMs),
      map: typeof r.map === 'string' ? r.map : null,
    })
  })
  ipc.handle('cs2:attach-faceit-match', async (e, recordingId, matchId) => {
    // Spends an analysis: only the app's own windows may ask.
    const frameUrl = (e as { senderFrame?: { url?: string } | null } | undefined)?.senderFrame?.url
    if (frameUrl !== undefined && !isTrustedRendererUrl(frameUrl)) return { ok: false, error: 'Untrusted request' }
    if (typeof recordingId !== 'string' || !recordingId || typeof matchId !== 'string') return { ok: false, error: 'Invalid request' }
    const existing = links.get(recordingId)
    if (existing?.matchId === matchId) return { ok: true, jobId: existing.jobId, already: true }
    const res = await queueFaceitMatch(getApi(), matchId)
    if (res.ok) links.set(recordingId, { matchId, jobId: res.jobId, linkedAt: Date.now() })
    return res
  })
  ipc.handle('cs2:get-faceit-link', (_e, recordingId) => (typeof recordingId === 'string' ? links.get(recordingId) : null))
}
