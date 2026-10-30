import axios, { AxiosInstance } from 'axios'
import { redactAxiosError } from './redact-axios-error'
import { app, safeStorage } from 'electron'
import { readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import log from 'electron-log'
import { withRetry } from './utils/retry'
import { normalizeToAcs } from './combat-score'
import { getApiBaseUrl } from './api-base'
import { resolveMaxValorantAccounts } from './valorant-account-cap'
import {
  clearCachedUser, clearTokenMeta, desktopDeviceName, loadCachedUser, markTokenIssued, queueSignOutEvent,
  readInstallId, saveCachedUser, takeSignOutEvents, tokenAgeDays, type SignOutEvent, type SignOutReason,
} from './session-store'

const API_BASE = getApiBaseUrl()

function tokenPath(): string {
  return join(app.getPath('userData'), 'auth.enc')
}

function userDataDir(): string {
  return app.getPath('userData')
}

/** Returns false when the session could not be saved (the user would have to sign in again next launch). */
function saveToken(token: string): boolean {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(token)
      writeFileSync(tokenPath(), encrypted)
    } else {
      writeFileSync(tokenPath(), Buffer.from(token, 'utf8'))
    }
    markTokenIssued(userDataDir())
    return true
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code
    log.error('[Auth] Session could not be saved to disk; the next launch will ask to sign in again. Reason:',
      code === 'ENOSPC' ? 'disk full' : code ?? (err as Error)?.message ?? 'unknown')
    return false
  }
}

const TOKEN_SHAPE = /^\d+\|[A-Za-z0-9]{20,}$/

/** Read the saved token. `failure` says why there is none (for sign-out telemetry). */
export function loadToken(): { token: string | null; failure: 'no_token_file' | 'decrypt_failed' | null } {
  let data: Buffer
  try {
    data = readFileSync(tokenPath())
  } catch {
    return { token: null, failure: 'no_token_file' }
  }
  if (safeStorage.isEncryptionAvailable()) {
    try {
      return { token: safeStorage.decryptString(data), failure: null }
    } catch (err) {
      // Saved before a keyring existed (Linux) or by a build without encryption: plain text is still usable.
      const plain = data.toString('utf8').trim()
      if (TOKEN_SHAPE.test(plain)) {
        log.warn('[Auth] Saved session was not encrypted; using it')
        return { token: plain, failure: null }
      }
      log.warn('[Auth] Saved session could not be decrypted (decrypt_failed):', (err as Error)?.message ?? 'unknown')
      return { token: null, failure: 'decrypt_failed' }
    }
  }
  const plain = data.toString('utf8').trim()
  return plain ? { token: plain, failure: null } : { token: null, failure: 'no_token_file' }
}

/** The Authorization header a request actually carried (AxiosHeaders or a plain object). */
function sentAuthorization(headers: unknown): string | null {
  if (!headers || typeof headers !== 'object') return null
  const h = headers as { get?: (k: string) => unknown; Authorization?: unknown; authorization?: unknown }
  const v = typeof h.get === 'function' ? h.get('Authorization') : (h.Authorization ?? h.authorization)
  return typeof v === 'string' ? v : null
}

/** Path only (no query string, which can carry ids or search terms), capped. */
function endpointPath(url: unknown): string | undefined {
  if (typeof url !== 'string' || !url) return undefined
  return url.split('?')[0].slice(0, 80)
}

function appVersion(): string | undefined {
  try { return app.getVersion() } catch { return undefined }
}

/** Only an explicit 401/403 means the token is no longer valid; timeouts and 5xx are not a sign-out. */
export function sessionRejected(status: number | undefined): boolean {
  return status === 401 || status === 403
}

/** Coach notes: the API's own message when it explains the refusal, else a plain fallback. */
function coachApiError(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { message?: unknown; error?: unknown } } })?.response?.data
  const msg = typeof data?.message === 'string' ? data.message : typeof data?.error === 'string' ? data.error : null
  return msg && msg.length <= 300 ? msg : fallback
}

export interface LolLinkedAccount {
  id: number
  riot_name: string
  riot_tag: string
  platform: string
  is_main: boolean
  verified: boolean
}

/** Keep only well-formed rows from /api/lol-accounts. */
export function parseLolAccounts(raw: unknown): LolLinkedAccount[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((a) => {
    const r = a as Record<string, unknown>
    const id = Number(r?.id)
    if (!Number.isSafeInteger(id) || id <= 0 || typeof r.riot_name !== 'string' || typeof r.riot_tag !== 'string') return []
    return [{ id, riot_name: r.riot_name, riot_tag: r.riot_tag, platform: String(r.platform ?? ''), is_main: r.is_main === true, verified: r.verified === true }]
  })
}

function lolAccountError(err: unknown, fallback: string): string {
  const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
  return typeof msg === 'string' && msg.trim() ? msg : fallback
}

function clearToken(): void {
  try { unlinkSync(tokenPath()) } catch { /* already gone */ }
  clearTokenMeta(userDataDir())
}

/** Background retries after a launch or refresh that could not reach the server (ms). */
export const USER_REFRESH_DELAYS_MS = [10_000, 30_000, 120_000, 300_000, 900_000]

export const RECURRING_STATUSES = ['active', 'improving', 'resolved'] as const
export type RecurringStatus = typeof RECURRING_STATUSES[number]

/** One recurring habit from the knowledge bank (subset). */
export interface RecurringInsight {
  id: number
  category: string | null
  label: string | null
  text: string
  severity: string | null
  occurrences: number
  status: string | null
  trend: string | null
  firstSeenAt: string | null
  lastSeenAt: string | null
  recommendation: string | null
}

export interface RiotAccount {
  id: number
  riot_name: string
  riot_tag: string
  riot_region?: string | null
  riot_platform?: string | null
  is_active: boolean
}

export interface AuthUser {
  id: number
  name: string
  email: string
  tier: string
  is_admin: boolean
  riot_name: string | null
  riot_tag: string | null
  riot_region?: string | null
  riot_verified?: boolean
  riot_accounts?: RiotAccount[]
  max_valorant_accounts?: number
  lol_riot_name?: string | null
  lol_riot_tag?: string | null
  lol_puuid?: string | null
  lol_platform?: string | null
  lol_region?: string | null
  riot_puuid?: string | null
  primary_game?: string | null
  games?: string[]
  deadlock_account_id?: number | null
  onboarding_target_rank?: string | null
  onboarding_weaknesses?: string[]
  cs2_tier?: string | null
  onboarding?: { connect_steam?: boolean; connected_riot_account?: boolean } | null
  stripe_subscription_status?: string | null
}

export interface ValorantStats {
  player_name: string | null
  player_tag: string | null
  current_rank: string | null
  peak_rank: string | null
  rr: number | null
  kd_ratio: number | null
  win_rate: number | null
  avg_combat_score: number | null
  headshot_percentage: number | null
  most_played_agent: string | null
  most_played_map: string | null
  player_card_id: string | null
  last_updated: string | null
}

export interface ProfileData {
  user: {
    id: number
    name: string
    email: string
    tier: string
    is_admin: boolean
    stripe_subscription_status?: string | null
    riot_name: string | null
    riot_tag: string | null
    riot_region: string | null
    lol_riot_name?: string | null
    lol_riot_tag?: string | null
    lol_platform?: string | null
    discord_username: string | null
    analysis_stats: { purchased?: number; total: number; limit: number | null; subscription_ends_at?: string | null }
    archive_stats?: {
      count: number
      limit: number | null
      remaining: number | null
      retention_days: number | null
      storage_bytes_used: number
    }
  }
  latest_stats: ValorantStats | null
}

export interface PlaystyleFocusArea {
  id: string
  category: string
  text: string
  severity: 'low' | 'medium' | 'high'
  agent?: string
}

export interface PlaystyleProfile {
  matches_tracked: number
  last_match_at: string | null
  metrics: Record<string, unknown>
  focus_areas: PlaystyleFocusArea[]
  agent_pool: Record<string, number>
}

export interface AnalysisItem {
  id: number
  job_id: string | null
  status: string
  map: string | null
  agent: string | null
  game_mode: string | null
  won: boolean | null
  kills: number | null
  deaths: number | null
  assists: number | null
  kda: number | null
  combat_score: number | null
  overall_score: number | null
  rounds_won: number | null
  rounds_lost: number | null
  hs_pct: number | null
  rank: string | null
  created_at: string
}

export type RRHistoryRange = '7d' | '30d' | 'all'

export class AuthManager {
  private _token: string | null = null
  private _user: AuthUser | null = null
  private _api: AxiosInstance
  /** Called when the server rejects the session (401/403) — use to force logout in the UI. */
  onSessionExpired?: () => void
  /** False while running on the cached user because the server could not be reached. */
  private _userFresh = false
  private _refreshTimer: ReturnType<typeof setTimeout> | null = null
  private _refreshAttempt = 0
  private _flushingSignOuts = false

  constructor() {
    this._api = axios.create({
      baseURL: API_BASE,
      timeout: 15000,
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }
    })

    this._api.interceptors.response.use(
      (res) => res,
      (err) => {
        // Only the token this request carried can be rejected: a late 401 from an older token
        // (e.g. a request still in flight from before a fresh sign-in) must not end the new session.
        if (err?.response?.status === 401 && this._token
          && sentAuthorization(err?.config?.headers) === `Bearer ${this._token}`) {
          this.endSession('http_401', { endpoint: endpointPath(err?.config?.url), status: 401 }, true)
        }
        // Never let the Bearer token travel with the error (handlers rethrow it; Electron logs it).
        return Promise.reject(redactAxiosError(err))
      }
    )
  }

  async loadStoredToken(): Promise<boolean> {
    try {
      const { token, failure } = loadToken()
      if (!token) {
        // A cached user means there was a session last time: record why it is gone.
        const dir = userDataDir()
        if (failure && loadCachedUser(dir)) {
          this.recordSignOut(failure, {})
          clearCachedUser(dir)
        }
        return false
      }

      this._token = token
      this._api.defaults.headers.common['Authorization'] = `Bearer ${token}`

      // On a slow or offline launch this returns the cached user and keeps retrying in the background.
      const user = await this.fetchUser()
      return !!user
    } catch {
      return false
    }
  }

  async login(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
    log.info('[Auth] login() called')
    try {
      log.info('[Auth] posting to /api/login')
      const res = await this._api.post('/api/login', { email, password, device_name: desktopDeviceName(readInstallId(userDataDir())) })
      log.info('[Auth] /api/login response status:', res.status)
      const { token, user } = res.data

      if (!token) {
        log.warn('[Auth] No token in response — server returned empty token')
        return { ok: false, error: 'Server did not return a token' }
      }

      this._token = token
      this._api.defaults.headers.common['Authorization'] = `Bearer ${token}`
      this.resetUserRefresh()

      saveToken(token)
      await this.fetchUser()
      log.info('[Auth] login succeeded for user:', this._user?.name ?? user?.name)
      return { ok: true }
    } catch (err: unknown) {
      const axiosErr = err as { code?: string; message?: string; response?: { status?: number; data?: { success?: boolean; error?: string; message?: string } } }
      log.error('[Auth] login error:', axiosErr.code, axiosErr.message, axiosErr.response?.status, JSON.stringify(axiosErr.response?.data))
      // ErrorHelper uses success/error; Laravel validation uses message.
      const data = axiosErr.response?.data
      const message = (data?.success === false ? data.error : data?.message)
        || (axiosErr.code === 'ECONNABORTED' ? 'Request timed out — check your internet connection' : null)
        || (axiosErr.code === 'ENOTFOUND' ? 'Cannot reach UpForge servers — check your internet connection' : null)
        || axiosErr.message
        || 'Login failed'
      return { ok: false, error: message }
    }
  }

  async logout(): Promise<void> {
    try {
      await this._api.post('/api/logout')
    } catch { /* ignore */ }

    this.endSession('user_logout', {}, false)
  }

  /**
   * The one place a session ends. Logs and queues the reason (never the token, headers or email)
   * so it can be sent as `desktop_signed_out` after the next sign-in.
   */
  private endSession(reason: SignOutReason, ctx: { endpoint?: string; status?: number; code?: string }, notify: boolean): void {
    if (!this._token && !this._user) return
    this.recordSignOut(reason, ctx)
    this._token = null
    this._user = null
    this.resetUserRefresh()
    delete this._api.defaults.headers.common['Authorization']
    clearToken()
    clearCachedUser(userDataDir())
    if (notify) this.onSessionExpired?.()
  }

  private recordSignOut(reason: SignOutReason, ctx: { endpoint?: string; status?: number; code?: string }): void {
    const dir = userDataDir()
    const event: SignOutEvent = {
      reason,
      at: new Date().toISOString(),
      ...(ctx.endpoint ? { endpoint: ctx.endpoint } : {}),
      ...(ctx.status != null ? { status: ctx.status } : {}),
      ...(ctx.code ? { code: ctx.code } : {}),
      tokenAgeDays: tokenAgeDays(dir),
      appVersion: appVersion(),
      platform: process.platform,
    }
    log.warn('[Auth] Session ended:', JSON.stringify(event))
    queueSignOutEvent(dir, event)
  }

  /** Send queued sign-out reasons now that a session works again. Failed sends are re-queued. */
  private async flushSignOutEvents(): Promise<void> {
    if (this._flushingSignOuts || !this._token) return
    this._flushingSignOuts = true
    const dir = userDataDir()
    try {
      const events = takeSignOutEvents(dir)
      for (const event of events) {
        try {
          await this._api.post('/api/funnel-events', {
            event: 'desktop_signed_out',
            channel: 'desktop',
            properties: event,
            app_version: event.appVersion?.slice(0, 32),
          })
        } catch {
          queueSignOutEvent(dir, event)
        }
      }
    } finally {
      this._flushingSignOuts = false
    }
  }

  private resetUserRefresh(): void {
    if (this._refreshTimer) clearTimeout(this._refreshTimer)
    this._refreshTimer = null
    this._refreshAttempt = 0
  }

  /** Retry fetching the user with backoff while running on the cached user. */
  private scheduleUserRefresh(): void {
    if (this._refreshTimer || this._refreshAttempt >= USER_REFRESH_DELAYS_MS.length) return
    const delay = USER_REFRESH_DELAYS_MS[this._refreshAttempt]
    this._refreshAttempt++
    this._refreshTimer = setTimeout(() => {
      this._refreshTimer = null
      void this.refreshUserNow()
    }, delay)
    ;(this._refreshTimer as { unref?: () => void }).unref?.()
  }

  /** Re-check the session now if we are running on the cached user (call on wake / network back). */
  async refreshUserNow(): Promise<boolean> {
    if (!this._token || this._userFresh) return this._userFresh
    await this.fetchUser()
    return this._userFresh
  }

  /** True while the signed-in user comes from the cache because the server was unreachable. */
  isUsingCachedUser(): boolean {
    return !!this._token && !!this._user && !this._userFresh
  }

  async fetchUser(): Promise<AuthUser | null> {
    const tokenAtStart = this._token
    try {
      const res = await withRetry(() => this._api.get('/api/user'), {
        attempts: 3,
        baseDelayMs: 800,
        shouldRetry: (err) => {
          const status = (err as { response?: { status?: number } })?.response?.status
          return !status || status >= 500 // retry server errors, not 4xx
        },
      })
      const raw = res.data?.user ?? res.data
      if (this._token !== tokenAtStart) return this._user // signed out or switched while waiting
      this._user = raw
      this._userFresh = true
      this.resetUserRefresh()
      if (raw) saveCachedUser(userDataDir(), raw)
      void this.flushSignOutEvents()
      return this._user
    } catch (err) {
      const status = (err as { status?: number; response?: { status?: number } })?.status
        ?? (err as { response?: { status?: number } })?.response?.status
      const code = (err as { code?: string })?.code
      if (!sessionRejected(status)) {
        // Slow or offline network: keep the session. On launch there is no user yet, so use the last
        // signed-in user from disk and keep retrying in the background.
        if (!this._user && this._token) {
          this._user = loadCachedUser<AuthUser>(userDataDir())
          if (this._user) log.info('[Auth] Server unreachable; opening with the saved session')
        }
        this._userFresh = false
        if (this._token) this.scheduleUserRefresh()
        log.warn('[Auth] fetchUser failed without a rejection; keeping session', status ?? code ?? 'network')
        return this._user
      }
      // A rejection of an older token (the session changed while this request ran) is not about this session.
      if (this._token !== tokenAtStart) return this._user
      this.endSession(status === 401 ? 'http_401' : 'user_403', { endpoint: '/api/user', status }, true)
      return null
    }
  }

  /** Push desktop primary-game choice to the account (keeps web + desktop in sync). */
  async syncPrimaryGameToApi(game: string): Promise<boolean> {
    if (!this._token) return false
    const primaryGame = game === 'cs2' || game === 'deadlock' ? game : 'valorant'
    const existing = this._user?.games?.length
      ? [...this._user.games]
      : [primaryGame]
    const games = existing.includes(primaryGame) ? existing : [...existing, primaryGame]
    try {
      const res = await this._api.put('/api/user/games', {
        games,
        primary_game: primaryGame,
      })
      const next = res.data?.primary_game ?? primaryGame
      if (this._user) {
        this._user.primary_game = next
        this._user.games = res.data?.games ?? games
      }
      return true
    } catch (err) {
      log.warn('[Auth] Failed to sync primary game to API:', err)
      return false
    }
  }

  async fetchProfile(): Promise<ProfileData | null> {
    try {
      const res = await this._api.get('/api/profile')
      const p = res.data?.profile
      if (!p) return null
      const stats = p.user?.analysis_stats ?? {}
      if (!Number.isFinite(stats.free_analyses_used) || stats.free_analyses_used < 0
        || !(stats.monthly_free_analyses === null || (Number.isFinite(stats.monthly_free_analyses) && stats.monthly_free_analyses >= 0))) return null
      const archiveRaw = p.user?.archive_stats ?? {}
      const isAdmin = !!(p.user?.is_admin)
      return {
        user: {
          ...p.user,
          is_admin: isAdmin,
          analysis_stats: {
            // API field names: free_analyses_used + monthly_free_analyses
            total: stats.free_analyses_used,
            purchased: stats.purchased_reports_remaining,
            limit: stats.monthly_free_analyses,
            subscription_ends_at: stats.subscription_ends_at ?? null,
          },
          archive_stats: archiveRaw.archived_count == null ? undefined : {
            count: archiveRaw.archived_count,
            limit: archiveRaw.archived_limit,
            remaining: archiveRaw.archived_remaining,
            retention_days: archiveRaw.retention_days ?? null,
            storage_bytes_used: archiveRaw.storage_bytes_used,
          },
          forge_rank: p.forge_rank ?? null,
        },
        latest_stats: p.latest_stats ?? null,
      }
    } catch {
      return null
    }
  }

  // ── Recurring mistakes (knowledge bank, read-only) — agent-leftovers ──
  /** Most recurring open habits for v3 Progress "What keeps coming up". Read-only. */
  async fetchRecurringInsights(limit = 6): Promise<RecurringInsight[] | null> {
    const perPage = Math.min(Math.max(Math.trunc(limit) || 6, 1), 12)
    try {
      // Valorant only: Progress shows this section for Valorant (insights are per game since the cross-game fix).
      const res = await this._api.get('/api/knowledge-bank', { params: { sort: 'most_recurring', per_page: perPage, game: 'valorant' } })
      const rows = Array.isArray(res.data?.insights) ? res.data.insights : []
      return rows.map((r: Record<string, unknown>): RecurringInsight => ({
        id: Number(r.id),
        category: typeof r.category === 'string' ? r.category : null,
        label: typeof r.theme_label === 'string' && r.theme_label ? r.theme_label : null,
        text: typeof r.insight_text === 'string' ? r.insight_text : '',
        severity: typeof r.severity === 'string' ? r.severity : null,
        occurrences: Number.isFinite(Number(r.occurrence_count)) ? Number(r.occurrence_count) : 0,
        status: typeof r.status === 'string' ? r.status : null,
        trend: typeof r.trend_direction === 'string' ? r.trend_direction : null,
        firstSeenAt: typeof r.first_seen_at === 'string' ? r.first_seen_at : null,
        lastSeenAt: typeof r.last_seen_at === 'string' ? r.last_seen_at : null,
        recommendation: typeof r.recommendation === 'string' ? r.recommendation : null,
      }))
    } catch {
      return null
    }
  }
  /** Set a habit's status (active / improving / resolved). Manual statuses stop the coach auto-changing it. */
  async setRecurringInsightStatus(id: number, status: RecurringStatus): Promise<{ ok: boolean; error?: string }> {
    if (!Number.isSafeInteger(id) || id <= 0 || !RECURRING_STATUSES.includes(status)) return { ok: false, error: 'Invalid request' }
    try {
      await this._api.patch(`/api/knowledge-bank/${id}/status`, { status })
      return { ok: true }
    } catch {
      return { ok: false, error: 'Could not update this habit.' }
    }
  }
  // ── end recurring mistakes ──

  async fetchPlaystyleProfile(): Promise<PlaystyleProfile | null> {
    try {
      const res = await this._api.get('/api/progress/playstyle-profile')
      return res.data?.profile ?? null
    } catch {
      return null
    }
  }

  /** Rank history snapshots. `all` = every snapshot since the player joined (the API treats any other value as full history). */
  async fetchRRHistory(range: RRHistoryRange = '30d'): Promise<Array<{ id: number; date: string; rank: string | null; rr: number; elo: number }>> {
    try {
      const safe: RRHistoryRange = range === '7d' || range === 'all' ? range : '30d'
      const res = await this._api.get(`/api/stats/rr-history?range=${safe}`)
      return res.data?.data ?? []
    } catch {
      return []
    }
  }

  async submitAnalysisFeedback(
    analysisId: number,
    payload: {
      rating?: 'thumbs_up' | 'thumbs_down'
      feedback_text?: string
      moment_feedback?: {
        round: number
        timestamp_seconds: number
        reason: 'wrong_action' | 'wrong_player' | 'not_visible' | 'other'
        evidence_text: string
      }
    },
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      await this._api.post(`/api/analysis/${analysisId}/feedback`, payload)
      return { ok: true }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string; error?: string } } })?.response?.data?.message
        ?? (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? (err instanceof Error ? err.message : 'Failed to submit feedback')
      return { ok: false, error: msg }
    }
  }

  async fetchAnalyses(limit = 10, game: 'valorant' | 'lol' = 'valorant'): Promise<AnalysisItem[]> {
    try {
      // The recent-analyses endpoint already reconciles processing rows. Avoid
      // a second blocking POST before every dashboard/history/stats read.
      const res = await this._api.get(`/api/analysis/recent?limit=${limit}&game=${game}`)
      const analyses: AnalysisItem[] = res.data?.analyses ?? []
      return analyses.map((a) => {
        const rounds = (a.rounds_won ?? 0) + (a.rounds_lost ?? 0)
        return {
          ...a,
          combat_score: normalizeToAcs(a.combat_score, rounds > 0 ? rounds : null),
        }
      })
    } catch {
      return []
    }
  }

  async fetchDeadlockAnalyses(limit = 10): Promise<Array<{
    id: number
    job_id: string
    status: string
    hero: string | null
    player_name: string | null
    match_result: string | null
    duration_minutes: number | null
    overall_rating: number | null
    kd_ratio: number | null
    kills: number | null
    deaths: number | null
    assists: number | null
    created_at: string
    completed_at: string | null
  }>> {
    try {
      const res = await this._api.get(`/api/deadlock/analyses?per_page=${limit}`)
      return res.data?.analyses ?? []
    } catch {
      return []
    }
  }

  async fetchCs2Analyses(limit = 10): Promise<Array<{
    id: number
    job_id: string | null
    status: string
    player_name: string | null
    map: string | null
    rounds_played: number | null
    score: string | null
    kd_ratio: number | null
    overall_rating: number | null
    created_at: string
    completed_at: string | null
    source?: 'demo_upload' | 'faceit_api' | 'desktop_vod'
    unified_id?: string
  }>> {
    try {
      const res = await this._api.get(`/api/cs2/analyses?per_page=${limit}`)
      return res.data?.analyses ?? []
    } catch {
      return []
    }
  }

  async fetchLolAnalyses(limit = 10): Promise<Array<{
    id: number
    job_id: string | null
    match_id: string
    status: string
    readiness_state: string | null
    champion: string | null
    role: string | null
    lane: string | null
    queue_id: number | null
    source: string | null
    created_at: string | null
    completed_at: string | null
  }>> {
    try {
      const res = await this._api.get(`/api/lol/analyses?per_page=${limit}`)
      return res.data?.data ?? []
    } catch {
      return []
    }
  }

  async fetchLolRecentMatches(): Promise<Array<{
    match_id: string
    queue_id: number
    champion: string
    role: string
    lane: string
    win: boolean
    kills: number
    deaths: number
    assists: number
    game_duration_seconds: number
    game_creation: number
  }>> {
    try {
      const res = await this._api.get('/api/lol/matches/recent')
      return res.data?.matches ?? []
    } catch {
      return []
    }
  }

  async fetchCs2Profile(): Promise<import('../../src/lib/cs2').Cs2ProfilePayload | null> {
    try {
      const res = await this._api.get('/api/cs2/profile')
      return res.data?.profile ?? null
    } catch {
      return null
    }
  }

  /** Save the Steam64 the demo parser confidently matched (the API canonicalises and validates it). */
  async syncCs2SteamId(steamId: string): Promise<void> {
    if (!this._api) return
    try {
      await this._api.put('/api/cs2/identity', { steam_id: steamId })
      log.info('[CS2Player] Saved Steam ID from a confidently matched demo')
    } catch {
      /* best-effort */
    }
  }

  async syncCs2Identity(steamDisplayName: string): Promise<void> {
    if (!this._api) return
    try {
      await this._api.put('/api/cs2/identity', {
        steam_display_name: steamDisplayName.trim() || null,
      })
    } catch {
      /* best-effort */
    }
  }

  private applyActiveRiotMirror(account: RiotAccount): void {
    if (!this._user || !account.is_active) return
    this._user.riot_name = account.riot_name
    this._user.riot_tag = account.riot_tag
    if (account.riot_region != null) this._user.riot_region = account.riot_region
  }

  async listRiotAccounts(): Promise<{
    accounts: RiotAccount[]
    max: number
    active_id: number | null
  }> {
    if (!this._api) {
      const accounts = this._user?.riot_accounts ?? []
      return {
        accounts,
        max: resolveMaxValorantAccounts({
          tier: this._user?.tier,
          isAdmin: this._user?.is_admin,
          userMax: this._user?.max_valorant_accounts,
        }),
        active_id: accounts.find((a) => a.is_active)?.id ?? null,
      }
    }
    try {
      const res = await this._api.get('/api/riot-accounts')
      const accounts = (res.data?.accounts ?? []) as RiotAccount[]
      const max = resolveMaxValorantAccounts({
        apiMax: res.data?.max_valorant_accounts ?? res.data?.max,
        tier: this._user?.tier,
        isAdmin: this._user?.is_admin,
        userMax: this._user?.max_valorant_accounts,
      })
      const active_id = (res.data?.active_id as number | null | undefined)
        ?? accounts.find((a) => a.is_active)?.id
        ?? null
      if (this._user) {
        this._user.riot_accounts = accounts
        this._user.max_valorant_accounts = max
        const active = accounts.find((a) => a.is_active)
        if (active) this.applyActiveRiotMirror(active)
      }
      return { accounts, max, active_id }
    } catch {
      const accounts = this._user?.riot_accounts ?? []
      return {
        accounts,
        max: resolveMaxValorantAccounts({
          tier: this._user?.tier,
          isAdmin: this._user?.is_admin,
          userMax: this._user?.max_valorant_accounts,
        }),
        active_id: accounts.find((a) => a.is_active)?.id ?? null,
      }
    }
  }

  async activateRiotAccount(id: number): Promise<{ ok: boolean; error?: string }> {
    if (!this._api) return { ok: false, error: 'Not logged in' }
    try {
      const res = await this._api.post(`/api/riot-accounts/${id}/activate`)
      const account = res.data?.account as RiotAccount | undefined
      if (account) {
        this.applyActiveRiotMirror(account)
      }
      await this.listRiotAccounts()
      return { ok: true }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      return { ok: false, error: msg || 'Failed to activate Riot account' }
    }
  }

  async linkRiotAccount(payload: {
    riot_name: string
    riot_tag: string
    riot_region?: string
  }): Promise<{ ok: boolean; error?: string; code?: string }> {
    if (!this._api) return { ok: false, error: 'Not logged in' }
    try {
      const res = await this._api.post('/api/riot-accounts', payload)
      const account = res.data?.account as RiotAccount | undefined
      await this.listRiotAccounts()
      if (account?.is_active) {
        this.applyActiveRiotMirror(account)
      }
      return { ok: true }
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { message?: string; error?: string } } })?.response?.data
      return {
        ok: false,
        error: data?.message || 'Failed to link Riot account',
        code: data?.error,
      }
    }
  }

  async removeRiotAccount(id: number): Promise<{ ok: boolean; error?: string }> {
    if (!this._api) return { ok: false, error: 'Not logged in' }
    try {
      await this._api.delete(`/api/riot-accounts/${id}`)
      await this.listRiotAccounts()
      return { ok: true }
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { message?: string; error?: string } } })?.response?.data
      return { ok: false, error: data?.message || 'Failed to remove Riot account' }
    }
  }

  /** Riot ID changed in game: rename an already linked account in place. */
  async renameRiotAccount(id: number, payload: {
    riot_name: string
    riot_tag: string
    riot_region?: string
  }): Promise<{ ok: boolean; error?: string; code?: string }> {
    if (!this._api) return { ok: false, error: 'Not logged in' }
    try {
      const res = await this._api.patch(`/api/riot-accounts/${id}`, payload)
      const account = res.data?.account as RiotAccount | undefined
      await this.listRiotAccounts()
      if (account?.is_active) {
        this.applyActiveRiotMirror(account)
      }
      return { ok: true }
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { message?: string; error?: string } } })?.response?.data
      return {
        ok: false,
        error: data?.message || 'Failed to update Riot account',
        code: data?.error,
      }
    }
  }

  async updateRiotAccount(payload: {
    riot_name: string
    riot_tag: string
    riot_region?: string
  }): Promise<{ ok: boolean; error?: string }> {
    if (!this._api) return { ok: false, error: 'Not logged in' }
    try {
      const res = await this._api.post('/api/profile/update-riot-account', payload)
      const account = res.data?.riot_account as {
        riot_name?: string
        riot_tag?: string
        riot_region?: string | null
      } | undefined
      if (this._user && account?.riot_name && account?.riot_tag) {
        this._user.riot_name = account.riot_name
        this._user.riot_tag = account.riot_tag
        if (account.riot_region != null) this._user.riot_region = account.riot_region
        this._user.riot_verified = false
      } else {
        await this.fetchUser()
      }
      return { ok: true }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      return { ok: false, error: msg || 'Failed to link Riot account' }
    }
  }

  /** League focus (read-only; checked by the API whenever recent matches load). */
  async fetchLolFocus(): Promise<unknown | null> {
    try { return (await this._api.get('/api/lol/focus')).data?.focus ?? null } catch { return null }
  }

  /** Current League rank + history (read-only). */
  async fetchLolRank(): Promise<{ rank: unknown; rank_history: unknown[] } | null> {
    try {
      const res = await this._api.get('/api/lol/analyses?per_page=1')
      return { rank: res.data?.rank ?? null, rank_history: res.data?.rank_history ?? [] }
    } catch { return null }
  }

  async fetchLolAnalysis(id: number): Promise<unknown | null> {
    if (!Number.isInteger(id) || id <= 0) return null
    try { return (await this._api.get(`/api/lol/analyses/${id}`)).data } catch { return null }
  }

  /** Starts stats coaching for one Riot match (uses 1 analysis; the UI asks first). */
  async analyzeLolMatch(matchId: string): Promise<{ ok: boolean; analysis_id?: number; error?: string }> {
    if (!/^[A-Z0-9]+_\d+$/i.test(matchId)) return { ok: false, error: 'Invalid match id' }
    try {
      const res = await this._api.post('/api/lol/analyze/match', { match_id: matchId })
      return { ok: true, analysis_id: res.data?.analysis_id }
    } catch (e) {
      const data = (e as { response?: { data?: { message?: string; error?: string } } })?.response?.data
      return { ok: false, error: data?.message ?? data?.error ?? 'Coaching could not be started.' }
    }
  }

  /** Deadlock match metadata incl. the signed-in player's hero (read-only). */
  async fetchDeadlockMatch(matchId: number): Promise<unknown | null> {
    if (!Number.isSafeInteger(matchId) || matchId <= 0) return null
    try { return (await this._api.get(`/api/deadlock/match/${matchId}`)).data } catch { return null }
  }

  async linkLolAccount(payload: {
    riot_name: string
    riot_tag: string
    lol_platform: string
  }): Promise<{ ok: boolean; error?: string }> {
    if (!this._api) return { ok: false, error: 'Not logged in' }
    try {
      const res = await this._api.post('/api/profile/lol-account', payload)
      const account = res.data?.lol_account as {
        riot_name?: string
        riot_tag?: string
        lol_platform?: string | null
      } | undefined
      if (this._user && account?.riot_name && account?.riot_tag) {
        this._user.lol_riot_name = account.riot_name
        this._user.lol_riot_tag = account.riot_tag
        this._user.lol_platform = account.lol_platform ?? null
      } else {
        await this.fetchUser()
      }
      return { ok: true }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      return { ok: false, error: msg || 'Failed to link League account' }
    }
  }

  // ── League accounts (main + alts) ─────────────────────────────────────────
  /** Cached League accounts, used to tag League recordings as main/alt without a network call. */
  private _lolAccounts: LolLinkedAccount[] = []

  getCachedLolAccounts(): LolLinkedAccount[] {
    return this._lolAccounts
  }

  async listLolAccounts(): Promise<{ ok: boolean; accounts: LolLinkedAccount[]; max: number | null; error?: string }> {
    if (!this._api) return { ok: false, accounts: [], max: null, error: 'Not logged in' }
    try {
      const res = await this._api.get('/api/lol-accounts')
      const accounts = parseLolAccounts(res.data?.accounts)
      this._lolAccounts = accounts
      const max = Number(res.data?.max_lol_accounts)
      return { ok: true, accounts, max: Number.isFinite(max) && max > 0 ? max : null }
    } catch (err: unknown) {
      return { ok: false, accounts: this._lolAccounts, max: null, error: lolAccountError(err, 'Could not load League accounts') }
    }
  }

  async addLolAccount(input: { riot_name: string; riot_tag: string; platform: string }): Promise<{ ok: boolean; error?: string; limit?: boolean }> {
    if (!this._api) return { ok: false, error: 'Not logged in' }
    const name = String(input?.riot_name ?? '').trim().slice(0, 64)
    const tag = String(input?.riot_tag ?? '').trim().replace(/^#/, '').slice(0, 16)
    const platform = String(input?.platform ?? '').trim().toUpperCase()
    if (!name || !/^[A-Z0-9]{2,6}$/.test(platform)) return { ok: false, error: 'Enter your Riot ID and pick your League server.' }
    try {
      await this._api.post('/api/lol-accounts', { riot_name: name, riot_tag: tag, platform })
      await this.listLolAccounts()
      await this.fetchUser()
      return { ok: true }
    } catch (err: unknown) {
      const limit = (err as { response?: { data?: { error?: string } } })?.response?.data?.error === 'account_limit_reached'
      return { ok: false, limit, error: lolAccountError(err, 'Could not link that League account') }
    }
  }

  async setMainLolAccount(id: number): Promise<{ ok: boolean; error?: string }> {
    if (!this._api) return { ok: false, error: 'Not logged in' }
    if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, error: 'Unknown account' }
    try {
      await this._api.post(`/api/lol-accounts/${id}/main`)
      await this.listLolAccounts()
      await this.fetchUser()
      return { ok: true }
    } catch (err: unknown) {
      return { ok: false, error: lolAccountError(err, 'Could not change your main League account') }
    }
  }

  async removeLolAccount(id: number): Promise<{ ok: boolean; error?: string }> {
    if (!this._api) return { ok: false, error: 'Not logged in' }
    if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, error: 'Unknown account' }
    try {
      await this._api.delete(`/api/lol-accounts/${id}`)
      await this.listLolAccounts()
      await this.fetchUser()
      return { ok: true }
    } catch (err: unknown) {
      return { ok: false, error: lolAccountError(err, 'Could not remove that League account') }
    }
  }

  async unlinkLolAccount(): Promise<{ ok: boolean; error?: string }> {
    if (!this._api) return { ok: false, error: 'Not logged in' }
    try {
      await this._api.delete('/api/profile/lol-account')
      if (this._user) {
        this._user.lol_riot_name = null
        this._user.lol_riot_tag = null
        this._user.lol_platform = null
      }
      return { ok: true }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      return { ok: false, error: msg || 'Failed to unlink League account' }
    }
  }

  async connectCs2Faceit(nickname: string): Promise<{ ok: boolean; error?: string }> {
    if (!this._api) return { ok: false, error: 'Not logged in' }
    try {
      await this._api.post('/api/cs2/faceit/connect', { nickname: nickname.trim() })
      return { ok: true }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      return { ok: false, error: msg || 'FACEIT player not found' }
    }
  }

  async searchDeadlockPlayers(query: string): Promise<Array<{ account_id: number; personaname: string }>> {
    if (!this._api) return []
    try {
      const res = await this._api.get('/api/deadlock/search', { params: { query: query.trim() } })
      return res.data?.results ?? []
    } catch {
      return []
    }
  }

  async lookupDeadlockPlayer(accountId: number): Promise<{ account_id: number; personaname: string } | null> {
    if (!this._api) return null
    try {
      const res = await this._api.get(`/api/deadlock/player/${accountId}`)
      return res.data ?? null
    } catch {
      return null
    }
  }

  async connectDeadlockAccount(accountId: number): Promise<{ ok: boolean; error?: string }> {
    if (!this._api) return { ok: false, error: 'Not logged in' }
    try {
      await this._api.post('/api/deadlock/connect', { account_id: accountId })
      if (this._user) this._user.deadlock_account_id = accountId
      await this.fetchUser()
      return { ok: true }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      return { ok: false, error: msg || 'Failed to connect Steam account' }
    }
  }

  async fetchSquad(): Promise<{ team: unknown; activity: unknown[]; presence: Record<number, { online: boolean; is_recording: boolean; game?: string | null }>; stats: unknown[]; leaderboard: unknown[]; error?: string } | null> {
    try {
      const teamRes = await this._api.get('/api/teams/my-team')
      if (!teamRes?.data?.team) return null

      const [activityRes, presenceRes, statsRes, leaderboardRes] = await Promise.all([
        this._api.get('/api/teams/activity?limit=20').catch(() => null),
        this._api.get('/api/teams/presence').catch(() => null),
        this._api.get('/api/teams/stats').catch(() => null),
        this._api.get('/api/teams/leaderboard').catch(() => null),
      ])

      return {
        team: teamRes.data.team,
        activity: activityRes?.data?.activity ?? [],
        presence: presenceRes?.data?.presence ?? {},
        stats: statsRes?.data?.stats ?? [],
        leaderboard: leaderboardRes?.data?.leaderboard ?? [],
      }
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 401 || status === 403) throw err
      return { team: null, activity: [], presence: {}, stats: [], leaderboard: [], error: 'Failed to load squad data' }
    }
  }

  async sendPresence(recording: boolean, game: string | null): Promise<void> {
    if (!this._token) return
    try {
      await this._api.post('/api/teams/presence', { is_recording: recording, game })
    } catch { /* ignore */ }
  }

  async fetchMyCoaches(): Promise<Array<{
    coach_id: number
    display_name: string
    avatar_url: string | null
    current_rank: string | null
    specialties: string[]
  }>> {
    try {
      const res = await this._api.get('/api/coach/my-coaches')
      return res.data?.coaches ?? []
    } catch {
      return []
    }
  }

  async requestRosterReview(
    analysisId: number,
    payload: { coachId: number; question?: string; roundNumbers?: number[] },
  ): Promise<{ ok: boolean; review?: unknown; error?: string }> {
    if (!this._token) return { ok: false, error: 'Not logged in' }
    try {
      const res = await this._api.post(`/api/analyses/${analysisId}/request-roster-review`, {
        coach_id: payload.coachId,
        question: payload.question?.trim() || undefined,
        round_numbers: payload.roundNumbers?.length ? payload.roundNumbers : undefined,
      })
      return { ok: true, review: res.data?.review }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string; error?: string } } })?.response?.data?.message
        ?? (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? (err instanceof Error ? err.message : 'Failed to request review')
      return { ok: false, error: msg }
    }
  }

  async fetchCoachReviewAnnotations(reviewId: number): Promise<{
    status: string
    student_question: string | null
    round_numbers: number[] | null
    coach_perspective: string | null
    annotations: Array<{
      id: number
      round_number: number | null
      video_offset_ms: number | null
      body: string
      created_at: string
    }>
  } | null> {
    try {
      const res = await this._api.get(`/api/coach/reviews/${reviewId}/annotations`)
      return res.data ?? null
    } catch {
      return null
    }
  }

  async fetchAnalysisCoachReview(analysisId: number): Promise<{
    id: number
    status: string
    source: string
    student_question: string | null
    round_numbers: number[] | null
    coach_perspective?: string | null
    coach?: { id: number; display_name: string }
    annotations?: Array<{
      id: number
      round_number: number | null
      video_offset_ms: number | null
      body: string
    }>
  } | null> {
    try {
      const res = await this._api.get(`/api/analyses/${analysisId}/coach-review`)
      return res.data?.review ?? null
    } catch {
      return null
    }
  }

  async fetchStudentHub(): Promise<{
    coaches: Array<Record<string, unknown>>
    stats: {
      coaches_count: number
      pending_reviews: number
      completed_reviews: number
      actionable_matches: number
    }
    pending_reviews: Array<Record<string, unknown>>
    recent_completed: Array<Record<string, unknown>>
    actionable_analyses: Array<Record<string, unknown>>
  }> {
    if (!this._token) throw new Error('Not logged in')
    const res = await this._api.get('/api/coach/student-hub')
    if (!res.data?.success) {
      throw new Error(
        (res.data?.message as string | undefined)
          ?? (res.data?.error as string | undefined)
          ?? 'Failed to load student hub',
      )
    }
    return {
      coaches: res.data.coaches ?? [],
      stats: res.data.stats ?? {
        coaches_count: 0,
        pending_reviews: 0,
        completed_reviews: 0,
        actionable_matches: 0,
      },
      pending_reviews: res.data.pending_reviews ?? [],
      recent_completed: res.data.recent_completed ?? [],
      actionable_analyses: res.data.actionable_analyses ?? [],
    }
  }

  async fetchCoachRoster(): Promise<{
    coach: { id: number; display_name: string }
    students: unknown[]
    settings: Record<string, unknown>
  } | null> {
    if (!this._token) return null
    try {
      const res = await this._api.get('/api/coach/roster')
      if (!res.data?.success) return null
      return {
        coach: res.data.coach,
        students: res.data.students ?? [],
        settings: res.data.settings ?? {},
      }
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 404 || status === 403) return null
      throw err
    }
  }

  async updateCoachRosterSettings(payload: {
    roster_enabled?: boolean
    roster_welcome_message?: string | null
    roster_membership_mode?: 'free' | 'paid'
    roster_membership_price_cents?: number
    roster_included_reviews_per_month?: number
  }): Promise<{ ok: true; settings: Record<string, unknown> } | { ok: false; error: string }> {
    if (!this._token) return { ok: false, error: 'Not logged in' }
    try {
      const res = await this._api.patch('/api/coach/roster/settings', payload)
      if (!res.data?.success) {
        return {
          ok: false,
          error: (res.data?.message as string | undefined)
            ?? (res.data?.error as string | undefined)
            ?? 'Failed to update roster settings',
        }
      }
      return { ok: true, settings: res.data.settings ?? {} }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string; error?: string } } })?.response?.data?.message
        ?? (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? (err instanceof Error ? err.message : 'Failed to update roster settings')
      return { ok: false, error: msg }
    }
  }

  async fetchCoachReviewRequests(): Promise<unknown[]> {
    if (!this._token) return []
    try {
      const res = await this._api.get('/api/coach/review-requests')
      return res.data?.reviews ?? []
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 404 || status === 403) return []
      throw err
    }
  }

  // ---- Coach marketplace (UI v3): read-only browse + my bookings. Booking/payment stays on the web. ----
  async fetchMarketplaceCoaches(game: string | null): Promise<{ ok: true; coaches: unknown[] } | { ok: false; error: string }> {
    const g = game && /^[a-z0-9]{2,12}$/.test(game) ? game : null
    try {
      const res = await this._api.get('/api/coaches', { params: { per_page: 100, ...(g ? { game: g } : {}) } })
      return { ok: true, coaches: Array.isArray(res.data?.coaches) ? res.data.coaches : [] }
    } catch { return { ok: false, error: 'Could not load coaches. Try again.' } }
  }

  async fetchMarketplaceCoach(coachId: number): Promise<{ ok: true; coach: Record<string, unknown> } | { ok: false; error: string }> {
    if (!Number.isSafeInteger(coachId) || coachId <= 0) return { ok: false, error: 'Coach not found.' }
    try {
      const coach = (await this._api.get(`/api/coaches/${coachId}`)).data?.coach
      return coach && typeof coach === 'object' ? { ok: true, coach } : { ok: false, error: 'Coach not found.' }
    } catch { return { ok: false, error: 'Could not load this coach. Try again.' } }
  }

  async fetchCoachReviewPricing(coachId: number): Promise<Record<string, unknown> | null> {
    if (!Number.isSafeInteger(coachId) || coachId <= 0) return null
    try { return (await this._api.get(`/api/coaches/${coachId}/review-pricing`)).data ?? null } catch { return null }
  }

  async fetchMyCoachingSessions(): Promise<{ ok: true; sessions: unknown[] } | { ok: false; error: string }> {
    if (!this._token) return { ok: false, error: 'Sign in first.' }
    try {
      const data = (await this._api.get('/api/coaching-sessions')).data
      return { ok: true, sessions: Array.isArray(data?.as_student) ? data.as_student : [] }
    } catch { return { ok: false, error: 'Could not load your bookings. Try again.' } }
  }

  async fetchMyPaidCoachReviews(): Promise<{ ok: true; reviews: unknown[] } | { ok: false; error: string }> {
    if (!this._token) return { ok: false, error: 'Sign in first.' }
    try {
      const r = (await this._api.get('/api/coaching-reviews/my-reviews')).data?.reviews
      const rows = Array.isArray(r) ? r : Array.isArray(r?.data) ? r.data : []
      return { ok: true, reviews: rows }
    } catch { return { ok: false, error: 'Could not load your reviews. Try again.' } }
  }

  // ---- Roster flow (UI v3): coach lookup from an invite + free roster join ----
  /** Public coach hub card (no auth needed server-side; sent with the session when signed in). */
  async fetchCoachPublicHub(coachId: number): Promise<{ ok: true; coach: Record<string, unknown> } | { ok: false; error: string }> {
    if (!Number.isSafeInteger(coachId) || coachId <= 0) return { ok: false, error: 'That invite link is not valid.' }
    try {
      const res = await this._api.get(`/api/coaches/${coachId}/hub`)
      const coach = res.data?.coach
      return coach && typeof coach === 'object' ? { ok: true, coach } : { ok: false, error: 'Coach not found.' }
    } catch (e) {
      const status = (e as { status?: number; response?: { status?: number } })?.status ?? (e as { response?: { status?: number } })?.response?.status
      return { ok: false, error: status === 404 ? 'No coach found for that link.' : 'Could not load this coach. Try again.' }
    }
  }

  /** Free roster join. Paid memberships finish on the web checkout (the UI opens it). */
  async joinCoachRoster(coachId: number): Promise<{ ok: boolean; error?: string; coachName?: string }> {
    if (!this._token) return { ok: false, error: 'Sign in first.' }
    if (!Number.isSafeInteger(coachId) || coachId <= 0) return { ok: false, error: 'That invite link is not valid.' }
    try {
      const res = await this._api.post('/api/coach/roster/join', { coach_id: coachId })
      return { ok: !!res.data?.success, coachName: res.data?.membership?.coach_name }
    } catch (e) {
      const data = (e as { response?: { data?: { message?: string; error?: string } } })?.response?.data
      return { ok: false, error: data?.error ?? data?.message ?? 'Could not join this roster.' }
    }
  }

  // ---- Coach notes (desktop, UI v3): add a timeline note, then complete a roster review. ----
  async addCoachReviewAnnotation(reviewId: number, note: { body: string; roundNumber?: number | null; videoOffsetMs?: number | null }): Promise<{ ok: true; id: number | null } | { ok: false; error: string }> {
    if (!this._token) return { ok: false, error: 'Not logged in' }
    try {
      const res = await this._api.post(`/api/coach/reviews/${reviewId}/annotations`, {
        body: note.body,
        round_number: note.roundNumber ?? null,
        video_offset_ms: note.videoOffsetMs ?? null,
      })
      const id = Number(res.data?.annotation?.id)
      return { ok: true, id: Number.isInteger(id) ? id : null }
    } catch (err: unknown) {
      return { ok: false, error: coachApiError(err, 'Could not save this note.') }
    }
  }

  async completeCoachRosterReview(reviewId: number, closingNote: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!this._token) return { ok: false, error: 'Not logged in' }
    try {
      await this._api.post(`/api/coach/reviews/${reviewId}/complete-roster`, closingNote ? { closing_note: closingNote } : {})
      return { ok: true }
    } catch (err: unknown) {
      return { ok: false, error: coachApiError(err, 'Could not complete this review.') }
    }
  }
  // ---- end Coach notes ----

  async startCoachReview(reviewId: number): Promise<{ ok: boolean; review?: unknown; error?: string }> {
    if (!this._token) return { ok: false, error: 'Not logged in' }
    try {
      const res = await this._api.post(`/api/coach/reviews/${reviewId}/start`)
      return { ok: true, review: res.data?.review }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string; error?: string } } })?.response?.data?.message
        ?? (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? (err instanceof Error ? err.message : 'Failed to start review')
      return { ok: false, error: msg }
    }
  }

  async createBillingPortalSession(): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
    if (!this._token) return { ok: false, error: 'Not logged in' }
    try {
      const res = await this._api.post('/api/payment/billing-portal')
      const url = res.data?.portal_url as string | undefined
      if (!res.data?.success || !url) {
        const msg = (res.data?.error as string | undefined)
          ?? (res.data?.message as string | undefined)
          ?? 'Could not open billing portal'
        return { ok: false, error: msg }
      }
      return { ok: true, url }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data?.error
        ?? (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? (err instanceof Error ? err.message : 'Could not open billing portal')
      return { ok: false, error: msg }
    }
  }

  getToken(): string | null {
    return this._token
  }

  getUser(): AuthUser | null {
    return this._user
  }

  isAuthenticated(): boolean {
    return !!this._token && !!this._user
  }

  getApi(): AxiosInstance {
    return this._api
  }
}
