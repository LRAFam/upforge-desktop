/**
 * League local match reports: after a match, read the League Client's end-of-game stats block,
 * build `upforge.lol_local_match.v1` and POST it to /api/desktop/lol/local-match.
 * Failed uploads stay on disk and are retried with backoff (the API is idempotent on
 * game_id + platform_id, so a resend after a lost response is stored once).
 * Only runs when the API reports `features.lol_local_reports` for the signed-in account.
 * No Electron imports (unit-tested); index.ts wires auth, paths and the recording lookup.
 */
import fs from 'fs'
import path from 'path'
import {
  buildLolLocalMatchPayload,
  type EogStatsBlock,
  type LolLocalIdentity,
  type LolLocalMatchCapture,
  type LolLocalMatchPayload,
} from './lol-local-match'
import { isRetryableUploadError, retryDelayMs } from './trainer-session-queue'

export const LOL_LOCAL_MATCH_ENDPOINT = '/api/desktop/lol/local-match'

type Log = { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void }

// ── End-of-game reader (LCU) ───────────────────────────────────────────────────

/** Client is still in (or loading) the game: the stats block is not ready yet. */
const IN_GAME_PHASES = new Set(['GameStart', 'InProgress', 'Reconnect', 'WaitingForStats'])
/** Post-game screen phases where the stats block is served. */
const EOG_PHASES = new Set(['PreEndOfGame', 'EndOfGame'])

export interface LolEogReaderDeps<L> {
  findLockfile: () => L | null
  get: <T>(lockfile: L, apiPath: string) => Promise<T>
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}

export interface LolEogReadResult {
  eog: EogStatsBlock | null
  identity: LolLocalIdentity
}

const EMPTY_IDENTITY: LolLocalIdentity = { puuid: null, gameName: null, tagLine: null, platformId: null, gameVersion: null }

function hasTeams(v: unknown): v is EogStatsBlock {
  return !!v && typeof v === 'object' && Array.isArray((v as EogStatsBlock).teams) && (v as EogStatsBlock).teams!.length > 0
}

/**
 * Wait for gameflow PreEndOfGame/EndOfGame, then read `/lol-end-of-game/v1/eog-stats-block`.
 * Also reads the local identity (puuid, Riot ID, platform) and client version for the patch.
 * Never throws; anything not read is null.
 */
export async function readLolEndOfGame<L>(
  deps: LolEogReaderDeps<L>,
  opts: { timeoutMs?: number; pollMs?: number } = {},
): Promise<LolEogReadResult> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)))
  const now = deps.now ?? Date.now
  const lockfile = deps.findLockfile()
  if (!lockfile) return { eog: null, identity: { ...EMPTY_IDENTITY } }

  const safe = async <T>(apiPath: string): Promise<T | null> => {
    try { return await deps.get<T>(lockfile, apiPath) } catch { return null }
  }

  const [summoner, platformId, version] = await Promise.all([
    safe<{ puuid?: string; gameName?: string; tagLine?: string }>('/lol-summoner/v1/current-summoner'),
    safe<string>('/lol-platform-config/v1/namespaces/LoginDataPacket/platformId'),
    safe<string>('/lol-patch/v1/game-version'),
  ])
  const identity: LolLocalIdentity = {
    puuid: typeof summoner?.puuid === 'string' && summoner.puuid ? summoner.puuid : null,
    gameName: typeof summoner?.gameName === 'string' && summoner.gameName ? summoner.gameName : null,
    tagLine: typeof summoner?.tagLine === 'string' && summoner.tagLine ? summoner.tagLine : null,
    platformId: typeof platformId === 'string' && platformId ? platformId : null,
    gameVersion: typeof version === 'string' && version ? version : null,
  }

  const deadline = now() + (opts.timeoutMs ?? 120_000)
  const pollMs = opts.pollMs ?? 3_000
  while (now() < deadline) {
    const phase = await safe<string>('/lol-gameflow/v1/gameflow-phase')
    if (phase === null) return { eog: null, identity } // client closed
    if (!IN_GAME_PHASES.has(phase)) {
      const eog = await safe<unknown>('/lol-end-of-game/v1/eog-stats-block')
      if (hasTeams(eog)) return { eog, identity }
      // Past the post-game screen (lobby / queue / champ select) and no block: it is gone.
      if (!EOG_PHASES.has(phase)) return { eog: null, identity }
    }
    await sleep(pollMs)
  }
  return { eog: null, identity }
}

// ── Upload queue ───────────────────────────────────────────────────────────────

interface PendingLolReport {
  key: string
  userId: number
  payload: LolLocalMatchPayload
  attempts: number
  nextAt: number
  createdAt: number
}

export const LOL_QUEUE_MAX_ITEMS = 20
export const LOL_QUEUE_MAX_ATTEMPTS = 12
export const LOL_QUEUE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export interface LolLocalMatchQueueOptions {
  file: string
  post: (payload: LolLocalMatchPayload) => Promise<unknown>
  /** Signed-in account id; reports only upload to the account that played them. */
  currentUserId: () => number | null
  now?: () => number
  log?: Log
  schedule?: (fn: () => void, ms: number) => unknown
}

export type LolReportOutcome = 'sent' | 'queued' | 'dropped'

export function lolReportKey(p: Pick<LolLocalMatchPayload, 'platform_id' | 'game_id'>): string {
  return `${p.platform_id}_${p.game_id}`
}

export class LolLocalMatchQueue {
  private pending: PendingLolReport[]
  private flushing = false
  private timerAt: number | null = null
  private readonly now: () => number

  constructor(private readonly opts: LolLocalMatchQueueOptions) {
    this.now = opts.now ?? Date.now
    this.pending = this.read()
  }

  get pendingCount(): number { return this.pending.length }

  async submit(userId: number, payload: LolLocalMatchPayload): Promise<LolReportOutcome> {
    const key = lolReportKey(payload)
    this.pending = this.pending.filter(p => p.key !== key || p.userId !== userId)
    const item: PendingLolReport = { key, userId, payload, attempts: 0, nextAt: this.now(), createdAt: this.now() }
    return this.attempt(item, true)
  }

  /** Retry everything due for the signed-in account. Safe to call often. */
  async flush(): Promise<void> {
    if (this.flushing) return
    this.flushing = true
    try {
      for (const item of [...this.pending]) {
        if (item.nextAt > this.now()) continue
        await this.attempt(item, false)
      }
    } finally {
      this.flushing = false
      this.scheduleNext()
    }
  }

  private async attempt(item: PendingLolReport, isNew: boolean): Promise<LolReportOutcome> {
    if (this.now() - item.createdAt > LOL_QUEUE_MAX_AGE_MS) return this.drop(item)
    if (this.opts.currentUserId() !== item.userId) return this.keep(item, isNew, false)
    try {
      await this.opts.post(item.payload)
      this.drop(item)
      this.opts.log?.info('[LolLocalMatch] Sent', item.key, item.attempts ? `(after ${item.attempts} retries)` : '')
      return 'sent'
    } catch (err) {
      const retry = isRetryableUploadError(err)
      this.opts.log?.warn('[LolLocalMatch] Upload failed:', (err as Error)?.message ?? (err as { status?: number })?.status, retry ? '(will retry)' : '(not retried)')
      if (!retry) return this.drop(item)
      return this.keep(item, isNew, true)
    }
  }

  private keep(item: PendingLolReport, isNew: boolean, tried: boolean): LolReportOutcome {
    if (tried) item.attempts += 1
    if (item.attempts >= LOL_QUEUE_MAX_ATTEMPTS) return this.drop(item)
    item.nextAt = this.now() + retryDelayMs(Math.max(item.attempts, 1))
    if (isNew) {
      this.pending.push(item)
      // Bounded on disk: the oldest report goes first.
      if (this.pending.length > LOL_QUEUE_MAX_ITEMS) this.pending = this.pending.slice(-LOL_QUEUE_MAX_ITEMS)
    }
    this.write()
    this.scheduleNext()
    return 'queued'
  }

  private drop(item: PendingLolReport): LolReportOutcome {
    const before = this.pending.length
    this.pending = this.pending.filter(p => p !== item && !(p.key === item.key && p.userId === item.userId))
    if (this.pending.length !== before) this.write()
    return 'dropped'
  }

  private scheduleNext(): void {
    if (!this.pending.length) return
    const due = Math.min(...this.pending.map(p => p.nextAt))
    if (this.timerAt !== null && this.timerAt <= due) return
    this.timerAt = due
    const schedule = this.opts.schedule ?? ((fn: () => void, ms: number) => {
      const t = setTimeout(fn, ms)
      ;(t as { unref?: () => void }).unref?.()
      return t
    })
    schedule(() => { this.timerAt = null; void this.flush() }, Math.max(0, due - this.now()))
  }

  private read(): PendingLolReport[] {
    try {
      const raw = JSON.parse(fs.readFileSync(this.opts.file, 'utf8')) as unknown
      return Array.isArray(raw)
        ? raw.filter((r): r is PendingLolReport => !!r && typeof r === 'object'
          && typeof (r as PendingLolReport).key === 'string'
          && typeof (r as PendingLolReport).userId === 'number'
          && !!(r as PendingLolReport).payload).slice(-LOL_QUEUE_MAX_ITEMS)
        : []
    } catch {
      return []
    }
  }

  private write(): void {
    try {
      fs.mkdirSync(path.dirname(this.opts.file), { recursive: true })
      fs.writeFileSync(this.opts.file, JSON.stringify(this.pending))
    } catch (err) {
      this.opts.log?.warn('[LolLocalMatch] Could not save pending reports:', (err as Error)?.message)
    }
  }
}

// ── After-match orchestration ──────────────────────────────────────────────────

export interface LolLocalReportDeps {
  /** API flag `features.lol_local_reports` for the signed-in account. */
  enabled: () => boolean
  currentUserId: () => number | null
  readEndOfGame: () => Promise<LolEogReadResult>
  queue: Pick<LolLocalMatchQueue, 'submit' | 'flush'>
  log?: Log
}

export type LolLocalReportResult = LolReportOutcome | 'disabled' | 'signed_out' | 'incomplete'

/**
 * Run once per finished League match. No-op unless the API flag is on.
 * `resolveRecordingId` is read after the end-of-game wait so the saved recording can be linked.
 */
export async function submitLolLocalMatch(
  deps: LolLocalReportDeps,
  capture: LolLocalMatchCapture,
  resolveRecordingId: () => string | null = () => null,
): Promise<LolLocalReportResult> {
  if (!deps.enabled()) return 'disabled'
  const userId = deps.currentUserId()
  if (userId === null) return 'signed_out'
  void deps.queue.flush()
  const { eog, identity } = await deps.readEndOfGame()
  let recordingId: string | null = null
  try { recordingId = resolveRecordingId() } catch { recordingId = null }
  const payload = buildLolLocalMatchPayload({ capture, eog, identity, recordingId })
  if (!payload) {
    deps.log?.warn('[LolLocalMatch] Not sent — game id, platform or local player could not be read', {
      eog: eog !== null, puuid: identity.puuid !== null, platform: identity.platformId !== null,
    })
    return 'incomplete'
  }
  // Re-check: the account may have changed while the post-game screen was open.
  if (deps.currentUserId() !== userId || !deps.enabled()) return 'signed_out'
  return deps.queue.submit(userId, payload)
}
