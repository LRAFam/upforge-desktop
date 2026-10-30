/**
 * Focus loop sync: send the player's recent Valorant matches (Riot match history, no
 * recording) to POST /api/match-report so every game is checked against their focus.
 *
 * First run: the newest match gets coach notes + the first focus; older matches are sent as
 * history (trend data only). Afterwards, every match newer than the last sync counts.
 */
import type { RecentMatchFetchResult } from './recent-match-export'
import { serializeRecentMatch } from './recent-match-export'
import type { FocusSyncResult, FocusUpdate } from '../../src/lib/focus'
import { deriveRoundFacts } from '../../src/lib/focus'

export interface SyncState {
  /** Match IDs already sent (or permanently skipped). */
  synced: string[]
  /** Start time (ms) of the newest match synced; null before the first sync. */
  newestSyncedStartMs: number | null
  /** Last live report, retained across route changes, empty syncs and restarts. */
  latest?: FocusSyncPayload | null
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

export type FocusSyncPayload = FocusUpdate

export interface SyncDeps {
  fetchRecent: (limit: number) => Promise<RecentMatchFetchResult>
  post: (body: Record<string, unknown>) => Promise<{ status: number; data: any }>
  loadState: () => Promise<SyncState>
  saveState: (state: SyncState) => Promise<void>
  onReport?: (update: FocusSyncPayload) => void
  serialize?: (timeline: NonNullable<RecentMatchFetchResult['matches'][number]['timeline']>, warnings: string[]) => string
}

export type SyncResult = FocusSyncResult

export async function syncMatchReports(deps: SyncDeps, limit = 20): Promise<SyncResult> {
  const fetched = await deps.fetchRecent(limit)
  if (!fetched.ok) {
    const reason = fetched.reason?.startsWith('riot_auth_missing') ? 'riot_client_unavailable' : fetched.reason ?? 'fetch_failed'
    return { ok: false, reason, uploaded: 0, skipped: 0, latest: null }
  }

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
  let cachedLatest = state.latest ?? null
  let reason: string | undefined
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
      reason ??= 'invalid_match'
      markDone(p) // fails the data-quality gate: never retry this match
      continue
    }
    let res: { status: number; data: any }
    try {
      res = await deps.post({ match_id: p.matchId, played_at_ms: p.startMs, history: p.history, match_data: matchData })
    } catch {
      reason = 'network_error'
      break // network: retry next sync
    }
    if (res.status === 200 && res.data?.success) {
      uploaded++
      markDone(p)
      if (!p.history) {
        const focus = res.data.focus ?? null
        latest = {
          focus,
          focus_event: res.data.focus_event ?? null,
          account: typeof res.data.account?.is_main === 'boolean' ? { is_main: res.data.account.is_main } : null,
          rounds: deriveRoundFacts(matchData),
          report: res.data.report ? { notes: res.data.report.notes ?? null, notes_source: res.data.report.notes_source } : null,
          match_id: p.matchId,
          previous_focus: cachedLatest?.focus && focus
            ? cachedLatest.focus.id !== focus.id ? cachedLatest.focus : cachedLatest.previous_focus ?? null
            : null,
        }
        cachedLatest = latest
        deps.onReport?.(latest)
      }
    } else if (res.status === 422) {
      skipped++
      // Only retain known codes, never raw API error bodies or authorization data.
      reason = res.data?.error === 'not_your_match' ? 'not_your_match' : reason ?? 'invalid_match'
      markDone(p) // not this player's match / invalid: never retry
    } else {
      reason = res.status === 401 || res.status === 403 ? 'sign_in_required' : `http_${res.status}`
      break // server or AI unavailable: retry next sync
    }
  }

  await deps.saveState({ synced: synced.slice(-MAX_REMEMBERED), newestSyncedStartMs: newest, latest: cachedLatest })
  return { ok: !reason, ...(reason ? { reason } : {}), uploaded, skipped, latest }
}
