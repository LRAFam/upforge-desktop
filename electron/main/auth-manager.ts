import axios, { AxiosInstance } from 'axios'
import { app, safeStorage } from 'electron'
import { readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import log from 'electron-log'
import { withRetry } from './utils/retry'
import { normalizeToAcs } from './combat-score'

const API_BASE = 'https://api.upforge.gg'

function tokenPath(): string {
  return join(app.getPath('userData'), 'auth.enc')
}

function saveToken(token: string): void {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(token)
      writeFileSync(tokenPath(), encrypted)
    } else {
      writeFileSync(tokenPath(), Buffer.from(token, 'utf8'))
    }
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code
    log.error('[Auth] Failed to persist auth token:', code === 'ENOSPC' ? 'disk full' : err)
  }
}

function loadToken(): string | null {
  try {
    const data = readFileSync(tokenPath())
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(data)
    }
    return data.toString('utf8')
  } catch {
    return null
  }
}

function clearToken(): void {
  try { unlinkSync(tokenPath()) } catch { /* already gone */ }
}

export interface AuthUser {
  id: number
  name: string
  email: string
  tier: string
  is_admin: boolean
  riot_name: string | null
  riot_tag: string | null
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
    discord_username: string | null
    analysis_stats: { total: number; limit: number | null; subscription_ends_at?: string | null }
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

export class AuthManager {
  private _token: string | null = null
  private _user: AuthUser | null = null
  private _api: AxiosInstance
  /** Called when a 401 response is received — use to force logout in the UI. */
  onSessionExpired?: () => void

  constructor() {
    this._api = axios.create({
      baseURL: API_BASE,
      timeout: 15000,
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }
    })

    this._api.interceptors.response.use(
      (res) => res,
      (err) => {
        if (err?.response?.status === 401 && this._token) {
          log.warn('[Auth] 401 received — session expired')
          this._token = null
          this._user = null
          delete this._api.defaults.headers.common['Authorization']
          this.onSessionExpired?.()
        }
        return Promise.reject(err)
      }
    )
  }

  async loadStoredToken(): Promise<boolean> {
    try {
      const token = loadToken()
      if (!token) return false

      this._token = token
      this._api.defaults.headers.common['Authorization'] = `Bearer ${token}`

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
      const res = await this._api.post('/api/login', { email, password, device_name: 'desktop' })
      log.info('[Auth] /api/login response status:', res.status)
      const { token, user } = res.data

      if (!token) {
        log.warn('[Auth] No token in response — server returned empty token')
        return { ok: false, error: 'Server did not return a token' }
      }

      this._token = token
      this._api.defaults.headers.common['Authorization'] = `Bearer ${token}`

      saveToken(token)
      await this.fetchUser()
      log.info('[Auth] login succeeded for user:', this._user?.name ?? user?.name)
      return { ok: true }
    } catch (err: unknown) {
      const axiosErr = err as { code?: string; message?: string; response?: { status?: number; data?: { message?: string } } }
      log.error('[Auth] login error:', axiosErr.code, axiosErr.message, axiosErr.response?.status, JSON.stringify(axiosErr.response?.data))
      const message = axiosErr.response?.data?.message
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

    this._token = null
    this._user = null
    delete this._api.defaults.headers.common['Authorization']
    clearToken()
  }

  async fetchUser(): Promise<AuthUser | null> {
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
      this._user = raw
      return this._user
    } catch {
      this._token = null
      this._user = null
      return null
    }
  }

  async fetchProfile(): Promise<ProfileData | null> {
    try {
      const res = await this._api.get('/api/profile')
      const p = res.data?.profile
      if (!p) return null
      const stats = p.user?.analysis_stats ?? {}
      const archiveRaw = p.user?.archive_stats ?? {}
      const isAdmin = !!(p.user?.is_admin)
      const tier = p.user?.tier ?? 'free'
      const unlimited = isAdmin || tier === 'admin'
      return {
        user: {
          ...p.user,
          is_admin: isAdmin,
          analysis_stats: {
            // API field names: free_analyses_used + monthly_free_analyses
            total: stats.free_analyses_used ?? 0,
            limit: unlimited ? null : (stats.monthly_free_analyses ?? 1),
            subscription_ends_at: stats.subscription_ends_at ?? null,
          },
          archive_stats: {
            count: archiveRaw.archived_count ?? 0,
            limit: unlimited ? null : (archiveRaw.archived_limit ?? null),
            remaining: unlimited ? null : (archiveRaw.archived_remaining ?? null),
            retention_days: archiveRaw.retention_days ?? null,
            storage_bytes_used: archiveRaw.storage_bytes_used ?? 0,
          },
          forge_rank: p.forge_rank ?? null,
        },
        latest_stats: p.latest_stats ?? null,
      }
    } catch {
      return null
    }
  }

  async fetchPlaystyleProfile(): Promise<PlaystyleProfile | null> {
    try {
      const res = await this._api.get('/api/progress/playstyle-profile')
      return res.data?.profile ?? null
    } catch {
      return null
    }
  }

  async fetchRRHistory(): Promise<Array<{ id: number; date: string; rank: string | null; rr: number; elo: number }>> {
    try {
      const res = await this._api.get('/api/stats/rr-history?range=30d')
      return res.data?.data ?? []
    } catch {
      return []
    }
  }

  async submitAnalysisFeedback(
    analysisId: number,
    payload: { rating: 'thumbs_up' | 'thumbs_down'; feedback_text?: string },
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

  async fetchAnalyses(limit = 10): Promise<AnalysisItem[]> {
    try {
      await this._api.post('/api/analysis/reconcile').catch(() => {})
      const res = await this._api.get(`/api/analysis/recent?limit=${limit}`)
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

  async fetchSquad(): Promise<{ team: unknown; activity: unknown[]; presence: Record<number, { online: boolean; is_recording: boolean }>; error?: string } | null> {
    try {
      // Fetch my-team first to detect auth errors vs no-team
      const teamRes = await this._api.get('/api/teams/my-team')
      if (!teamRes?.data?.team) return null

      // Fetch activity and presence in parallel (non-critical, swallow errors)
      const [activityRes, presenceRes] = await Promise.all([
        this._api.get('/api/teams/activity?limit=20').catch(() => null),
        this._api.get('/api/teams/presence').catch(() => null),
      ])

      return {
        team: teamRes.data.team,
        activity: activityRes?.data?.activity ?? [],
        presence: presenceRes?.data?.presence ?? {},
      }
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 401 || status === 403) throw err
      return { team: null, activity: [], presence: {}, error: 'Failed to load squad data' }
    }
  }

  async sendPresence(recording: boolean, game: string | null): Promise<void> {
    if (!this._token) return
    try {
      await this._api.post('/api/teams/presence', { is_recording: recording, game })
    } catch { /* ignore */ }
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
