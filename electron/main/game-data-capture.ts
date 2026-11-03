/**
 * Hidden diagnostic: save the RAW live game data UpForge receives during ONE CS2 or Deadlock match.
 *
 * Off by default. Armed from Settings › Advanced (persisted in diagnostics/capture-state.json) or with
 * UPFORGE_CAPTURE_GAME_DATA=1. The first CS2 or Deadlock match after arming is captured, then the
 * switch turns itself off. Files stay in userData/diagnostics and are never uploaded.
 *
 * - CS2: every GSI POST body → gsi-<matchStart>.jsonl (one `{ receivedAt, body }` per line).
 * - Deadlock: console.log lines written during the match, the Steam-cache / replay signals the
 *   watcher reads (deadlock-signals-<matchStart>.jsonl), and the match metadata fetched afterwards.
 * - Both: summary-<game>-<matchStart>.json (components seen, counts, first/last timestamps).
 *
 * See docs/debug/game-data-capture.md.
 */

import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { resolveDeadlockConsoleLogCandidates } from './deadlock-paths'
import { buildDeadlockReplayUrl, type DeadlockMatchSalts } from './deadlock-steam-cache'
import { listRecentCS2Demos } from './cs2-demo-finder'
import {
  Cs2AnswerAnalyzer,
  classifyDeadlockConsole,
  cs2AfterMatchAnswers,
  deadlockAfterMatchAnswers,
  type AfterMatchEvent,
  type Answers,
} from './game-data-capture-answers'

export type CaptureGame = 'cs2' | 'deadlock'

export const CAPTURE_ENV_VAR = 'UPFORGE_CAPTURE_GAME_DATA'
export const CAPTURE_MAX_BYTES = 200 * 1024 * 1024
/** Keep capturing the scoreboard briefly after CS2 reports gameover. */
export const CS2_GAMEOVER_GRACE_MS = 60_000
/** Close a CS2 capture when GSI goes silent this long (game closed mid-match). */
export const CS2_IDLE_CLOSE_MS = 5 * 60_000
/** Bodies kept from before the match goes live, written at the top of the file. */
const PRE_MATCH_BUFFER = 20
/** After-match observations (demo lookups, metadata) are kept this long after a capture ends. */
export const AFTER_MATCH_WINDOW_MS = 3 * 60 * 60_000
/** deadlock-api allows 3 unauthenticated calls/hour: never more than 3 per capture. */
export const DEADLOCK_API_DELAYS_MS = [5 * 60_000, 20 * 60_000, 45 * 60_000]
export const DEADLOCK_REPLAY_HEAD_DELAYS_MS = [0, 5 * 60_000, 20 * 60_000]
/** CS2 writes an auto-recorded client demo at match end. */
export const CS2_LOCAL_DEMO_CHECK_MS = 2 * 60_000
/** Throttle used by the all-components cfg (steam-gsi-server gsiCfgContents(true)). Keep in sync. */
const FULL_GSI_THROTTLE_S = 0.2
/** Capture lines are batched and appended asynchronously at most this often. */
const FLUSH_INTERVAL_MS = 2_000
const FLUSH_MAX_BYTES = 1024 * 1024
const MAX_AFTER_MATCH_EVENTS = 100

export type CaptureStopReason = 'match-ended' | 'size-limit' | 'game-closed' | 'switched-off'

interface ComponentStats {
  count: number
  nonEmptyCount: number
  firstAt: number
  lastAt: number
}

export interface CaptureSummary {
  game: CaptureGame
  matchStartedAt: number
  endedAt: number | null
  stopReason: CaptureStopReason | null
  bytesWritten: number
  files: string[]
  /** CS2: GSI bodies written. Deadlock: console lines + signals written. */
  updates: number
  firstAt: number | null
  lastAt: number | null
  /** Top-level GSI keys (CS2) or signal kinds (Deadlock). */
  components: Record<string, ComponentStats>
  /** Nested fields worth confirming, e.g. `player.position`, `allplayers.*.weapons`. */
  fields: Record<string, ComponentStats>
  /** CS2 only: largest number of entries ever seen under `allplayers`. */
  maxAllplayers?: number
  /** Deadlock only. */
  deadlock?: {
    matchId: number | null
    consoleLogPaths: string[]
    consoleLines: number
    consoleLogHint: string | null
    metadataSaved: boolean
    lastReplayGrowthAt?: number | null
    firstReplaySaltAt?: number | null
    replayUrl?: string | null
    consoleCensus?: Record<string, unknown> | null
  }
  /** Answers to research §5 questions, keyed by question number. */
  answers?: Answers
  /** Observations after the match: demo lookups, parse time, metadata availability. */
  afterMatch?: AfterMatchEvent[]
}

export interface CaptureStatus {
  armed: boolean
  armedByEnv: boolean
  dir: string
  active: { game: CaptureGame; matchStartedAt: number; bytesWritten: number; updates: number } | null
  last: CaptureSummary | null
}

interface PersistedState {
  armed: boolean
  last?: CaptureSummary | null
}

interface ActiveCapture {
  summary: CaptureSummary
  dataPath: string
  /** Lines not yet on disk — flushed in one async append (never sync I/O per GSI POST). */
  pending: string[]
  pendingBytes: number
  gameoverAt: number | null
  /** Deadlock: console.log size at match start. */
  consoleOffsets: Array<{ path: string; size: number }>
  cs2?: Cs2AnswerAnalyzer
  lastReplaySize?: number
}

export interface GameDataCaptureOptions {
  dir: string
  maxBytes?: number
  env?: NodeJS.ProcessEnv
  now?: () => number
  /** Deadlock console.log candidates (deadlock-paths). */
  resolveConsoleLogs?: () => Promise<string[]>
  /** CS2 .dem files modified since a time (cs2-demo-finder). */
  listLocalDemos?: (sinceMs: number) => Promise<Array<{ name: string; sizeBytes: number; modifiedAt: number }>>
  fetchImpl?: (url: string, init?: { method?: string }) => Promise<{ status: number; text: () => Promise<string> }>
}

function nonEmpty(value: unknown): boolean {
  if (value == null) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value as object).length > 0
  return true
}

function bump(map: Record<string, ComponentStats>, key: string, value: unknown, at: number): void {
  const s = map[key] ?? (map[key] = { count: 0, nonEmptyCount: 0, firstAt: at, lastAt: at })
  s.count++
  if (nonEmpty(value)) s.nonEmptyCount++
  s.lastAt = at
}

const LIVE_MAP_PHASES = new Set(['live', 'warmup', 'intermission', 'freezetime', 'paused'])

type GsiState = 'live' | 'gameover' | 'menu' | 'other'

/**
 * Live/ended rules like steam-gsi-server, kept local so capture stays self-contained. Unlike the
 * recorder we ignore `player.activity === 'menu'` — that is also the in-match Esc menu.
 */
export function classifyGsiBody(body: unknown): GsiState {
  const b = (body ?? {}) as { map?: { name?: string; phase?: string }; round?: { phase?: string } }
  const mapName = (b.map?.name ?? '').toLowerCase()
  const phase = (b.map?.phase ?? '').toLowerCase()
  if (!mapName || mapName === 'menu') return 'menu'
  if (phase === 'gameover') return 'gameover'
  if (LIVE_MAP_PHASES.has(phase)) return 'live'
  const roundPhase = (b.round?.phase ?? '').toLowerCase()
  return roundPhase === 'live' || roundPhase === 'freezetime' ? 'live' : 'other'
}

const NESTED_PLAYER_FIELDS = ['state', 'weapons', 'match_stats', 'position', 'forward', 'steamid', 'team', 'activity']

function summariseGsiBody(summary: CaptureSummary, body: unknown, at: number): void {
  if (!body || typeof body !== 'object') {
    bump(summary.components, '(unparsed)', null, at)
    return
  }
  const b = body as Record<string, unknown>
  for (const [key, value] of Object.entries(b)) bump(summary.components, key, value, at)

  const player = b.player as Record<string, unknown> | undefined
  if (player && typeof player === 'object') {
    for (const f of NESTED_PLAYER_FIELDS) if (f in player) bump(summary.fields, `player.${f}`, player[f], at)
  }
  const map = b.map as Record<string, unknown> | undefined
  if (map && typeof map === 'object' && 'round_wins' in map) bump(summary.fields, 'map.round_wins', map.round_wins, at)

  const all = b.allplayers as Record<string, Record<string, unknown>> | undefined
  if (all && typeof all === 'object') {
    const entries = Object.values(all)
    summary.maxAllplayers = Math.max(summary.maxAllplayers ?? 0, entries.length)
    for (const f of NESTED_PLAYER_FIELDS) {
      const values = entries.map((p) => p?.[f]).filter((v) => v !== undefined)
      if (values.length) bump(summary.fields, `allplayers.*.${f}`, values.find(nonEmpty) ?? null, at)
    }
  }
}

function emptySummary(game: CaptureGame, matchStartedAt: number): CaptureSummary {
  return {
    game,
    matchStartedAt,
    endedAt: null,
    stopReason: null,
    bytesWritten: 0,
    files: [],
    updates: 0,
    firstAt: null,
    lastAt: null,
    components: {},
    fields: {},
  }
}

export class GameDataCapture {
  readonly dir: string
  private readonly maxBytes: number
  private readonly now: () => number
  private readonly armedByEnv: boolean
  private readonly resolveConsoleLogs: () => Promise<string[]>
  private envConsumed = false
  private state: PersistedState
  private active: ActiveCapture | null = null
  private preMatch: Array<{ receivedAt: number; body: unknown }> = []
  private idleTimer: ReturnType<typeof setTimeout> | null = null
  private graceTimer: ReturnType<typeof setTimeout> | null = null
  private pendingMetadata: { matchId: number; matchStartedAt: number } | null = null
  private disarmedListeners: Array<() => void> = []
  private readonly listLocalDemos: NonNullable<GameDataCaptureOptions['listLocalDemos']>
  private readonly fetchImpl: GameDataCaptureOptions['fetchImpl']
  private afterTimers: Array<ReturnType<typeof setTimeout>> = []
  private replayHeadScheduled = false
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private writeChain: Promise<void> = Promise.resolve()

  constructor(opts: GameDataCaptureOptions) {
    this.dir = opts.dir
    this.maxBytes = opts.maxBytes ?? CAPTURE_MAX_BYTES
    this.now = opts.now ?? Date.now
    this.armedByEnv = (opts.env ?? process.env)[CAPTURE_ENV_VAR] === '1'
    this.resolveConsoleLogs = opts.resolveConsoleLogs ?? (async () => [])
    this.listLocalDemos = opts.listLocalDemos ?? (async () => [])
    this.fetchImpl = opts.fetchImpl ?? (typeof fetch === 'function' ? (url, init) => fetch(url, init) : undefined)
    this.state = this.readState()
  }

  private statePath(): string {
    return path.join(this.dir, 'capture-state.json')
  }

  private readState(): PersistedState {
    try {
      const raw = JSON.parse(fs.readFileSync(this.statePath(), 'utf-8')) as PersistedState
      return { armed: raw.armed === true, last: raw.last ?? null }
    } catch {
      return { armed: false, last: null }
    }
  }

  private writeState(): void {
    try {
      fs.mkdirSync(this.dir, { recursive: true })
      fs.writeFileSync(this.statePath(), JSON.stringify(this.state, null, 2), 'utf-8')
    } catch { /* diagnostics only */ }
  }

  /** True while the next (or current) match should be captured. */
  isArmed(): boolean {
    return this.state.armed || (this.armedByEnv && !this.envConsumed)
  }

  /** CS2 cfg should request every GSI component (armed or mid-capture). */
  wantsFullGsi(): boolean {
    return this.isArmed() || this.active?.summary.game === 'cs2'
  }

  onDisarmed(listener: () => void): void {
    this.disarmedListeners.push(listener)
  }

  setArmed(on: boolean): CaptureStatus {
    if (on) {
      this.state.armed = true
      this.envConsumed = false
      this.writeState()
    } else {
      if (this.active) this.finish('switched-off')
      this.disarm()
    }
    return this.getStatus()
  }

  private disarm(): void {
    const was = this.isArmed()
    this.state.armed = false
    this.envConsumed = true
    this.writeState()
    if (was) for (const l of this.disarmedListeners) { try { l() } catch { /* ignore */ } }
  }

  getStatus(): CaptureStatus {
    const a = this.active
    return {
      armed: this.isArmed(),
      armedByEnv: this.armedByEnv && !this.envConsumed,
      dir: this.dir,
      active: a
        ? { game: a.summary.game, matchStartedAt: a.summary.matchStartedAt, bytesWritten: a.summary.bytesWritten, updates: a.summary.updates }
        : null,
      last: this.state.last ?? null,
    }
  }

  // ── writing ─────────────────────────────────────────────────────────────

  private start(game: CaptureGame, at: number, dataName: string): ActiveCapture | null {
    try {
      fs.mkdirSync(this.dir, { recursive: true })
      const dataPath = path.join(this.dir, dataName)
      const summary = emptySummary(game, at)
      summary.files.push(dataName)
      this.active = { summary, dataPath, pending: [], pendingBytes: 0, gameoverAt: null, consoleOffsets: [] }
      return this.active
    } catch {
      return null
    }
  }

  /** Append one line; false (and capture stopped) once the size guard is hit. */
  private writeLine(line: string): boolean {
    const a = this.active
    if (!a) return false
    const bytes = Buffer.byteLength(line) + 1
    if (a.summary.bytesWritten + bytes > this.maxBytes) {
      this.finish('size-limit')
      return false
    }
    a.pending.push(line)
    a.pendingBytes += bytes
    a.summary.bytesWritten += bytes
    if (a.pendingBytes >= FLUSH_MAX_BYTES) this.flush(a)
    else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => { this.flushTimer = null; if (this.active) this.flush(this.active) }, FLUSH_INTERVAL_MS)
      this.flushTimer.unref?.()
    }
    return true
  }

  /** Append buffered lines off the main thread, in order. */
  private flush(a: ActiveCapture): void {
    if (!a.pending.length) return
    const chunk = a.pending.join('\n') + '\n'
    a.pending = []
    a.pendingBytes = 0
    this.writeChain = this.writeChain
      .then(() => fs.promises.appendFile(a.dataPath, chunk, 'utf-8'))
      .catch(() => { /* diagnostics only */ })
  }

  /** Resolves once every captured line has been written (tests / shutdown). */
  async flushed(): Promise<void> {
    if (this.active) this.flush(this.active)
    await this.writeChain
  }

  private finish(reason: CaptureStopReason): CaptureSummary | null {
    const a = this.active
    if (!a) return null
    this.clearTimers()
    if (this.flushTimer) clearTimeout(this.flushTimer)
    this.flushTimer = null
    this.flush(a)
    if (a.summary.game === 'deadlock') this.copyDeadlockConsole(a)
    a.summary.endedAt = this.now()
    a.summary.stopReason = reason
    a.summary.afterMatch = []
    this.active = null
    this.preMatch = []
    this.afterTimers.forEach(clearTimeout)
    this.afterTimers = []
    this.replayHeadScheduled = false
    this.state.last = a.summary
    if (a.cs2) a.summary.answers = { ...a.cs2.answers(FULL_GSI_THROTTLE_S) }
    this.refreshAfterMatchAnswers(a.summary)
    this.writeSummary(a.summary)
    this.disarm()
    this.scheduleAfterMatch(a.summary)
    return a.summary
  }

  private summaryName(s: CaptureSummary): string {
    return `summary-${s.game}-${s.matchStartedAt}.json`
  }

  private writeSummary(s: CaptureSummary): void {
    const name = this.summaryName(s)
    if (!s.files.includes(name)) s.files.push(name)
    try {
      fs.writeFileSync(path.join(this.dir, name), JSON.stringify(s, null, 2), 'utf-8')
    } catch { /* diagnostics only */ }
  }

  private clearTimers(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    if (this.graceTimer) clearTimeout(this.graceTimer)
    this.idleTimer = null
    this.graceTimer = null
  }

  // ── CS2 ─────────────────────────────────────────────────────────────────

  /** Called by the GSI server for EVERY POST body (raw text, before parsing). */
  ingestGsi(rawBody: string, parsed?: unknown): void {
    if (!this.active && !this.isArmed()) return
    if (this.active && this.active.summary.game !== 'cs2') return
    const at = this.now()
    let body: unknown = parsed ?? null
    if (parsed === undefined) {
      try { body = JSON.parse(rawBody) } catch { body = null }
    }
    const state: GsiState = body == null ? 'other' : classifyGsiBody(body)

    if (!this.active) {
      if (state !== 'live') {
        this.preMatch.push({ receivedAt: at, body: body ?? rawBody })
        if (this.preMatch.length > PRE_MATCH_BUFFER) this.preMatch.shift()
        return
      }
      if (!this.start('cs2', at, `gsi-${at}.jsonl`)) return
      for (const p of this.preMatch) this.writeCs2(p.body, p.receivedAt, true)
      this.preMatch = []
    }

    if (!this.writeCs2(body ?? rawBody, at, false)) return
    this.armIdleTimer()

    const a = this.active
    if (!a) return
    if (state === 'menu') {
      this.finish('match-ended')
    } else if (state === 'gameover') {
      if (a.gameoverAt == null) {
        a.gameoverAt = at
        this.graceTimer = setTimeout(() => this.finish('match-ended'), CS2_GAMEOVER_GRACE_MS)
        this.graceTimer.unref?.()
      } else if (at - a.gameoverAt >= CS2_GAMEOVER_GRACE_MS) {
        this.finish('match-ended')
      }
    }
  }

  private writeCs2(body: unknown, at: number, preMatch: boolean): boolean {
    const a = this.active
    if (!a) return false
    const line = JSON.stringify(preMatch ? { receivedAt: at, preMatch: true, body } : { receivedAt: at, body })
    if (!this.writeLine(line)) return false
    a.summary.updates++
    a.summary.firstAt ??= at
    a.summary.lastAt = at
    summariseGsiBody(a.summary, typeof body === 'string' ? null : body, at)
    if (typeof body !== 'string') (a.cs2 ??= new Cs2AnswerAnalyzer()).ingest(body, at)
    return true
  }

  private armIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = setTimeout(() => this.finish('game-closed'), CS2_IDLE_CLOSE_MS)
    this.idleTimer.unref?.()
  }

  // ── after the match ─────────────────────────────────────────────────────

  /**
   * Record something the app observed after the captured match (demo lookup, parse time…).
   * Ignored unless the last capture was this game and ended < 3 h ago.
   */
  noteAfterMatch(game: CaptureGame, kind: string, data: unknown): void {
    const last = this.state.last
    if (!last || last.game !== game || last.endedAt == null) return
    const at = this.now()
    if (at - last.endedAt > AFTER_MATCH_WINDOW_MS) return
    const events = last.afterMatch ??= []
    if (events.length >= MAX_AFTER_MATCH_EVENTS) return
    events.push({ at, kind, data })
    const name = `after-${game}-${last.matchStartedAt}.jsonl`
    try {
      fs.appendFileSync(path.join(this.dir, name), JSON.stringify({ receivedAt: at, kind, data }) + '\n')
      if (!last.files.includes(name)) last.files.push(name)
    } catch { /* diagnostics only */ }
    this.refreshAfterMatchAnswers(last)
    this.writeSummary(last)
    this.writeState()
  }

  private refreshAfterMatchAnswers(s: CaptureSummary): void {
    const events = s.afterMatch ?? []
    if (s.game === 'cs2') {
      s.answers = { ...s.answers, ...cs2AfterMatchAnswers(s.endedAt, events) }
      return
    }
    const dl = s.deadlock
    s.answers = {
      ...s.answers,
      13: {
        ...(dl?.consoleCensus ?? { written: false }),
        consoleLogPaths: dl?.consoleLogPaths ?? [],
        hint: dl?.consoleLogHint ?? null,
      },
      ...deadlockAfterMatchAnswers({
        endedAt: s.endedAt,
        lastReplayGrowthAt: dl?.lastReplayGrowthAt ?? null,
        firstReplaySaltAt: dl?.firstReplaySaltAt ?? null,
        events,
      }),
    }
  }

  private later(ms: number, fn: () => Promise<void> | void): void {
    const t = setTimeout(() => { void Promise.resolve().then(fn).catch(() => { /* diagnostics only */ }) }, ms)
    t.unref?.()
    this.afterTimers.push(t)
  }

  private scheduleAfterMatch(s: CaptureSummary): void {
    if (s.game === 'cs2') {
      this.later(CS2_LOCAL_DEMO_CHECK_MS, async () => {
        const demos = await this.listLocalDemos(s.matchStartedAt)
        this.noteAfterMatch('cs2', 'cs2-local-demos', { found: demos.length, demos: demos.slice(0, 8) })
      })
      return
    }
    const matchId = s.deadlock?.matchId
    if (matchId == null || !this.fetchImpl) return
    // deadlock-api metadata: at most 3 calls (unauthenticated limit is 3/hour); stop on first 200.
    let metadataOk = false
    const url = `https://api.deadlock-api.com/v1/matches/${matchId}/metadata`
    for (const delay of DEADLOCK_API_DELAYS_MS) {
      this.later(delay, async () => {
        if (metadataOk || this.state.last !== s) return
        const res = await this.safeFetch(url, 'GET')
        if (res.status === 200 && res.body) {
          metadataOk = true
          const name = `deadlock-api-metadata-${s.matchStartedAt}.json`
          try {
            fs.writeFileSync(path.join(this.dir, name), res.body, 'utf-8')
            if (!s.files.includes(name)) s.files.push(name)
          } catch { /* ignore */ }
        }
        this.noteAfterMatch('deadlock', 'deadlock-api-metadata', { status: res.status, error: res.error, bytes: res.body?.length ?? 0 })
      })
    }
    if (s.deadlock?.replayUrl) this.scheduleReplayHead(s)
  }

  /** Is the Valve CDN replay downloadable yet? HEAD only, max 3 tries. */
  private scheduleReplayHead(s: CaptureSummary): void {
    const url = s.deadlock?.replayUrl
    if (!url || this.replayHeadScheduled || !this.fetchImpl) return
    this.replayHeadScheduled = true
    let ok = false
    for (const delay of DEADLOCK_REPLAY_HEAD_DELAYS_MS) {
      this.later(delay, async () => {
        if (ok || this.state.last !== s) return
        const res = await this.safeFetch(url, 'HEAD')
        ok = res.status === 200
        this.noteAfterMatch('deadlock', 'deadlock-replay-head', { status: res.status, error: res.error })
      })
    }
  }

  private async safeFetch(url: string, method: 'GET' | 'HEAD'): Promise<{ status: number; body?: string; error?: string }> {
    try {
      const res = await this.fetchImpl!(url, { method })
      return { status: res.status, body: method === 'GET' && res.status === 200 ? await res.text() : undefined }
    } catch (err) {
      return { status: 0, error: err instanceof Error ? err.message : String(err) }
    }
  }

  private noteSalts(dl: NonNullable<CaptureSummary['deadlock']>, salts: DeadlockMatchSalts, at: number): void {
    if (salts?.replaySalt == null || dl.firstReplaySaltAt != null) return
    if (dl.matchId != null && salts.matchId !== dl.matchId) return
    dl.firstReplaySaltAt = at
    try { dl.replayUrl = buildDeadlockReplayUrl(salts) } catch { dl.replayUrl = null }
  }

  private noteDeadlockSaltsAfterMatch(salts: DeadlockMatchSalts): void {
    const last = this.state.last
    const dl = last?.deadlock
    if (!last || last.game !== 'deadlock' || !dl || last.endedAt == null) return
    if (this.now() - last.endedAt > AFTER_MATCH_WINDOW_MS) return
    const had = dl.firstReplaySaltAt != null
    this.noteSalts(dl, salts, this.now())
    if (!had && dl.firstReplaySaltAt != null) {
      this.noteAfterMatch('deadlock', 'steam-cache-salts', salts)
      this.scheduleReplayHead(last)
    }
  }

  // ── Deadlock ────────────────────────────────────────────────────────────

  async deadlockMatchStarted(matchId: number | null): Promise<void> {
    if (this.active || !this.isArmed()) return
    const at = this.now()
    const a = this.start('deadlock', at, `deadlock-signals-${at}.jsonl`)
    if (!a) return
    a.summary.deadlock = {
      matchId,
      consoleLogPaths: [],
      consoleLines: 0,
      consoleLogHint: null,
      metadataSaved: false,
      lastReplayGrowthAt: null,
      firstReplaySaltAt: null,
      replayUrl: null,
      consoleCensus: null,
    }
    this.deadlockSignal('match-started', { matchId })
    let candidates: string[] = []
    try { candidates = await this.resolveConsoleLogs() } catch { /* none */ }
    if (this.active !== a) return
    for (const p of candidates) {
      let size = 0
      try { size = fs.statSync(p).size } catch { size = -1 }
      a.consoleOffsets.push({ path: p, size })
    }
  }

  /** Any live signal the Deadlock watcher reads (Steam cache salts, replay file growth…). */
  deadlockSignal(kind: string, data: unknown): void {
    const a = this.active
    if (!a || a.summary.game !== 'deadlock') {
      // Salts often land in Steam's cache after the match ended — keep timing them.
      if (kind === 'steam-cache-salts') this.noteDeadlockSaltsAfterMatch(data as DeadlockMatchSalts)
      return
    }
    const at = this.now()
    const dl = a.summary.deadlock
    if (dl && kind === 'replay-file') {
      const size = (data as { size?: number })?.size ?? 0
      if (a.lastReplaySize == null || size > a.lastReplaySize) dl.lastReplayGrowthAt = at
      a.lastReplaySize = size
    }
    if (dl && kind === 'steam-cache-salts') this.noteSalts(dl, data as DeadlockMatchSalts, at)
    if (!this.writeLine(JSON.stringify({ receivedAt: at, kind, data }))) return
    a.summary.updates++
    a.summary.firstAt ??= at
    a.summary.lastAt = at
    bump(a.summary.components, kind, data, at)
  }

  deadlockMatchEnded(reason: CaptureStopReason = 'match-ended'): void {
    const a = this.active
    if (!a || a.summary.game !== 'deadlock') return
    const matchId = a.summary.deadlock?.matchId ?? null
    const startedAt = a.summary.matchStartedAt
    this.finish(reason)
    if (matchId != null) this.pendingMetadata = { matchId, matchStartedAt: startedAt }
  }

  /** Save the match metadata JSON the app fetches after the match (arrives minutes later). */
  saveDeadlockMetadata(matchId: number, response: unknown): void {
    const p = this.pendingMetadata
    if (!p || p.matchId !== matchId || response == null) return
    const name = `deadlock-match-${p.matchStartedAt}.json`
    try {
      fs.writeFileSync(path.join(this.dir, name), JSON.stringify({ receivedAt: this.now(), matchId, response }, null, 2), 'utf-8')
    } catch { return }
    this.pendingMetadata = null
    const last = this.state.last
    if (last && last.game === 'deadlock' && last.matchStartedAt === p.matchStartedAt) {
      if (last.deadlock) last.deadlock.metadataSaved = true
      last.files.push(name)
      this.writeSummary(last)
      this.writeState()
    }
  }

  private copyDeadlockConsole(a: ActiveCapture): void {
    const dl = a.summary.deadlock
    if (!dl) return
    const outName = `deadlock-console-${a.summary.matchStartedAt}.log`
    const outPath = path.join(this.dir, outName)
    let wroteAny = false
    let consoleText = ''
    for (const { path: src, size: startSize } of a.consoleOffsets) {
      let endSize: number
      try { endSize = fs.statSync(src).size } catch { continue }
      // File missing at start, or truncated by a game restart → copy from the top.
      const from = startSize < 0 || endSize < startSize ? 0 : startSize
      const length = endSize - from
      if (length <= 0) continue
      const room = this.maxBytes - a.summary.bytesWritten
      const take = Math.min(length, Math.max(0, room))
      if (take <= 0) break
      try {
        const buf = Buffer.alloc(take)
        const fd = fs.openSync(src, 'r')
        try { fs.readSync(fd, buf, 0, take, from) } finally { fs.closeSync(fd) }
        fs.appendFileSync(outPath, `# ${src} (bytes ${from}–${from + take})\n`)
        fs.appendFileSync(outPath, buf)
        a.summary.bytesWritten += take
        const text = buf.toString('utf-8')
        dl.consoleLines += text.split('\n').filter((l) => l.trim() !== '').length
        consoleText += text
        dl.consoleLogPaths.push(src)
        wroteAny = true
      } catch { /* skip unreadable */ }
      if (take < length) break
    }
    dl.consoleCensus = classifyDeadlockConsole(consoleText)
    if (wroteAny) {
      a.summary.files.push(outName)
    } else {
      dl.consoleLogHint = a.consoleOffsets.some((o) => o.size >= 0)
        ? 'console.log did not grow during the match.'
        : 'No Deadlock console.log found. Add -condebug to Deadlock launch options in Steam, restart Deadlock, then capture again.'
    }
  }
}

// ── singleton (real app) ─────────────────────────────────────────────────

let instance: GameDataCapture | null = null

/** Real app instance under userData/diagnostics; null when Electron isn't available (tests). */
export function getGameDataCapture(): GameDataCapture | null {
  if (instance) return instance
  try {
    if (!app?.getPath) return null
    instance = new GameDataCapture({
      dir: path.join(app.getPath('userData'), 'diagnostics'),
      resolveConsoleLogs: () => resolveDeadlockConsoleLogCandidates(),
      listLocalDemos: async (sinceMs) => {
        const { files } = await listRecentCS2Demos()
        return files
          .filter((f) => f.modifiedAt >= sinceMs)
          .map((f) => ({ name: f.name, sizeBytes: f.sizeBytes, modifiedAt: f.modifiedAt }))
      },
    })
    return instance
  } catch {
    return null
  }
}
