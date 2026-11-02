/**
 * Background sync of the player's own VALORANT replays to UpForge.
 *
 * Whenever the player is in the menus, look at their recent match history and, for each match with a replay
 * we haven't handled yet, download the .vrf from Riot and upload it for replay-based coaching. Runs from a
 * timer rather than the match-end hook, so it also catches matches played while UpForge was closed (replays
 * stay available until the next patch).
 *
 * Every outcome is recorded locally, and every final failure is reported to the API, so a broken download or
 * a Riot change shows up in monitoring instead of silently falling back.
 */
import type { ReplayDownloadResult } from './valorant-replay-download'

/** Queues that record replays (custom games and the range don't). */
export const REPLAY_QUEUES = new Set(['competitive', 'unrated', 'swiftplay', 'premier'])
export const MAX_MATCH_AGE_MS = 7 * 24 * 3600_000
export const MATCHES_PER_RUN = 2
/** Riot can take a few minutes to make the replay available after the match. */
export const RETRY_AFTER_MS = 10 * 60_000
const MAX_ATTEMPTS: Record<string, number> = { no_replay: 6, default: 4 }

export interface ReplayMatch {
  matchId: string
  gameStartTimeMs: number | null
  queueId?: string
}

export interface ReplaySyncEntry {
  status: 'uploaded' | 'pending' | 'failed'
  attempts: number
  lastTryMs: number
  error?: string
  gameVersion?: string
  sizeBytes?: number
}

export type ReplaySyncState = Record<string, ReplaySyncEntry>

export type UploadResult = { ok: true } | { ok: false; error: string }

export interface ReplaySyncDeps {
  enabled: () => boolean
  isMatchActive: () => Promise<boolean>
  listRecentMatches: (limit: number) => Promise<ReplayMatch[] | null>
  download: (matchId: string) => Promise<ReplayDownloadResult>
  upload: (matchId: string, bytes: Buffer, meta: { gameVersion: string; checksum: string; queueId?: string }) => Promise<UploadResult>
  /** Tell the API about a final failure (monitoring). Must not throw. */
  report: (matchId: string, error: string, meta: { gameVersion?: string; attempts: number; queueId?: string }) => Promise<void>
  loadState: () => ReplaySyncState
  saveState: (state: ReplaySyncState) => void
  now?: () => number
  log?: (msg: string) => void
}

export interface ReplaySyncRun {
  ran: boolean
  reason?: string
  uploaded: string[]
  failed: string[]
  pending: string[]
}

export class ValorantReplaySync {
  private running = false

  constructor(private deps: ReplaySyncDeps) {}

  status(): ReplaySyncState {
    return this.deps.loadState()
  }

  async run(): Promise<ReplaySyncRun> {
    const out: ReplaySyncRun = { ran: false, uploaded: [], failed: [], pending: [] }
    if (!this.deps.enabled()) return { ...out, reason: 'disabled' }
    if (this.running) return { ...out, reason: 'already_running' }
    this.running = true
    const now = this.deps.now ?? Date.now
    const log = this.deps.log ?? (() => {})
    try {
      if (await this.deps.isMatchActive()) return { ...out, reason: 'match_in_progress' }
      const history = await this.deps.listRecentMatches(10)
      if (!history) return { ...out, reason: 'riot_client_not_ready' }
      const state = this.deps.loadState()
      const due = history.filter((m) => this.isDue(m, state[m.matchId.toLowerCase()], now())).slice(0, MATCHES_PER_RUN)
      out.ran = true
      for (const m of due) {
        const id = m.matchId.toLowerCase()
        const prev = state[id]
        const attempts = (prev?.attempts ?? 0) + 1
        const dl = await this.deps.download(m.matchId)
        let entry: ReplaySyncEntry
        if (dl.ok) {
          const up = await this.deps.upload(id, dl.bytes, { gameVersion: dl.gameVersion, checksum: dl.checksum, queueId: m.queueId })
          entry = up.ok
            ? { status: 'uploaded', attempts, lastTryMs: now(), gameVersion: dl.gameVersion, sizeBytes: dl.bytes.length }
            : { status: 'pending', attempts, lastTryMs: now(), error: `upload:${up.error}`, gameVersion: dl.gameVersion }
        } else {
          entry = { status: 'pending', attempts, lastTryMs: now(), error: dl.error }
        }
        if (entry.status === 'pending' && attempts >= (MAX_ATTEMPTS[entry.error ?? ''] ?? MAX_ATTEMPTS.default)) {
          entry.status = 'failed'
          await this.deps.report(id, entry.error ?? 'unknown', { gameVersion: entry.gameVersion, attempts, queueId: m.queueId })
            .catch(() => {})
        }
        state[id] = entry
        this.deps.saveState(state)
        out[entry.status === 'uploaded' ? 'uploaded' : entry.status === 'failed' ? 'failed' : 'pending'].push(id)
        log(`[ReplaySync] ${id} ${entry.status}${entry.error ? ` (${entry.error})` : ''} attempt ${attempts}`)
      }
      return out
    } finally {
      this.running = false
    }
  }

  private isDue(m: ReplayMatch, prev: ReplaySyncEntry | undefined, now: number): boolean {
    if (!REPLAY_QUEUES.has((m.queueId ?? '').toLowerCase())) return false
    if (m.gameStartTimeMs != null && now - m.gameStartTimeMs > MAX_MATCH_AGE_MS) return false
    if (!prev) return true
    if (prev.status !== 'pending') return false
    return now - prev.lastTryMs >= RETRY_AFTER_MS
  }
}
