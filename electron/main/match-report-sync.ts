/**
 * Focus loop sync: send the player's recent Valorant matches (Riot match history, no
 * recording) to POST /api/match-report so every game is checked against their focus.
 *
 * First run: the newest match gets coach notes + the first focus; older matches are sent as
 * history (trend data only). Afterwards, every match newer than the last sync counts.
 */
import type { RecentMatchFetchResult } from './recent-match-export'
import { serializeRecentMatch } from './recent-match-export'

export interface SyncState {
  /** Match IDs already sent (or permanently skipped). */
  synced: string[]
  /** Start time (ms) of the newest match synced; null before the first sync. */
  newestSyncedStartMs: number | null
}

export const EMPTY_SYNC_STATE: SyncState = { synced: [], newestSyncedStartMs: null }
const MAX_REMEMBERED = 200

export interface PlannedUpload {
  matchId: string
  startMs: number | null
  history: boolean
}

export function planUploads(
  matches: Array<{ matchId: string; gameStartTimeMs: number | null; ok: boolean }>,
  state: SyncState,
): PlannedUpload[] {
  const done = new Set(state.synced)
  const fresh = matches
    .filter(m => m.ok && !done.has(m.matchId))
    .sort((a, b) => (a.gameStartTimeMs ?? 0) - (b.gameStartTimeMs ?? 0))
  if (!fresh.length) return []
  if (state.newestSyncedStartMs == null) {
    // First sync: only the newest match is "now"; the rest is history.
    return fresh.map((m, i) => ({ matchId: m.matchId, startMs: m.gameStartTimeMs, history: i < fresh.length - 1 }))
  }
  const cutoff = state.newestSyncedStartMs
  return fresh.map(m => ({
    matchId: m.matchId,
    startMs: m.gameStartTimeMs,
    history: m.gameStartTimeMs == null || m.gameStartTimeMs <= cutoff,
  }))
}

export interface FocusSyncPayload {
  focus: unknown
  focus_event: string | null
  report?: { notes?: unknown; metrics?: unknown; focus_suggestion?: unknown; notes_source?: string } | null
  match_id: string
}

export interface SyncDeps {
  fetchRecent: (limit: number) => Promise<RecentMatchFetchResult>
  post: (body: Record<string, unknown>) => Promise<{ status: number; data: any }>
  loadState: () => Promise<SyncState>
  saveState: (state: SyncState) => Promise<void>
  serialize?: (timeline: NonNullable<RecentMatchFetchResult['matches'][number]['timeline']>, warnings: string[]) => string
}

export interface SyncResult {
  ok: boolean
  reason?: string
  uploaded: number
  skipped: number
  latest: FocusSyncPayload | null
}

export async function syncMatchReports(deps: SyncDeps, limit = 20): Promise<SyncResult> {
  const fetched = await deps.fetchRecent(limit)
  if (!fetched.ok) return { ok: false, reason: fetched.reason ?? 'fetch_failed', uploaded: 0, skipped: 0, latest: null }

  const state = await deps.loadState()
  const serialize = deps.serialize ?? serializeRecentMatch
  const byId = new Map(fetched.matches.map(m => [m.matchId, m]))
  const plan = planUploads(
    fetched.matches.map(m => ({ matchId: m.matchId, gameStartTimeMs: m.gameStartTimeMs, ok: !!m.timeline })),
    state,
  )

  let uploaded = 0
  let skipped = 0
  let latest: FocusSyncPayload | null = null
  const synced = [...state.synced]
  let newest = state.newestSyncedStartMs
  const markDone = (p: PlannedUpload) => {
    synced.push(p.matchId)
    if (p.startMs != null && (newest == null || p.startMs > newest)) newest = p.startMs
  }

  for (const p of plan) {
    const entry = byId.get(p.matchId)!
    let matchData: unknown
    try {
      matchData = JSON.parse(serialize(entry.timeline!, entry.warnings ?? [])).match_data
    } catch {
      skipped++
      markDone(p) // fails the data-quality gate: never retry this match
      continue
    }
    let res: { status: number; data: any }
    try {
      res = await deps.post({ match_id: p.matchId, played_at_ms: p.startMs, history: p.history, match_data: matchData })
    } catch {
      break // network: retry next sync
    }
    if (res.status === 200 && res.data?.success) {
      uploaded++
      markDone(p)
      if (!p.history) {
        latest = { focus: res.data.focus ?? null, focus_event: res.data.focus_event ?? null, report: res.data.report ?? null, match_id: p.matchId }
      }
    } else if (res.status === 422) {
      skipped++
      markDone(p) // not this player's match / invalid: never retry
    } else {
      break // server or AI unavailable: retry next sync
    }
  }

  await deps.saveState({ synced: synced.slice(-MAX_REMEMBERED), newestSyncedStartMs: newest })
  return { ok: true, uploaded, skipped, latest }
}
