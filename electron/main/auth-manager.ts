import axios, { AxiosInstance } from 'axios'
import { app, safeStorage } from 'electron'
import { readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import log from 'electron-log'

const API_BASE = 'https://api.upforge.gg'

function tokenPath(): string {
  return join(app.getPath('userData'), 'auth.enc')
}

function saveToken(token: string): void {
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(token)
    writeFileSync(tokenPath(), encrypted)
  } else {
    // Fallback: store plaintext (better than nothing, rare edge case)
    writeFileSync(tokenPath(), Buffer.from(token, 'utf8'))
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
  riot_name: string | null
  riot_tag: string | null
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
    riot_name: string | null
    riot_tag: string | null
    riot_region: string | null
    discord_username: string | null
    analysis_stats: { total: number; limit: number }
  }
  latest_stats: ValorantStats | null
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

  constructor() {
    this._api = axios.create({
      baseURL: API_BASE,
      timeout: 15000,
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }
    })
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
      this._user = user
      this._api.defaults.headers.common['Authorization'] = `Bearer ${token}`

      saveToken(token)
      log.info('[Auth] login succeeded for user:', user?.name)
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
      const res = await this._api.get('/api/user')
      this._user = res.data?.user ?? res.data
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
      return {
        user: {
          ...p.user,
          analysis_stats: {
            // API field names: free_analyses_used + monthly_free_analyses
            total: stats.free_analyses_used ?? 0,
            limit: stats.monthly_free_analyses ?? 1,
          }
        },
        latest_stats: p.latest_stats ?? null,
      }
    } catch {
      return null
    }
  }

  async fetchAnalyses(limit = 10): Promise<AnalysisItem[]> {
    try {
      const res = await this._api.get(`/api/analysis/recent?limit=${limit}`)
      return res.data?.analyses ?? []
    } catch {
      return []
    }
  }

  async fetchSquad(): Promise<{ team: unknown; activity: unknown[]; presence: Record<number, { online: boolean; is_recording: boolean }> } | null> {
    try {
      const [teamRes, activityRes, presenceRes] = await Promise.all([
        this._api.get('/api/teams/my-team').catch(() => null),
        this._api.get('/api/teams/activity?limit=20').catch(() => null),
        this._api.get('/api/teams/presence').catch(() => null),
      ])
      if (!teamRes?.data?.team) return null
      return {
        team: teamRes.data.team,
        activity: activityRes?.data?.activity ?? [],
        presence: presenceRes?.data?.presence ?? {},
      }
    } catch {
      return null
    }
  }

  async sendPresence(recording: boolean, game: string | null): Promise<void> {
    if (!this._token) return
    try {
      await this._api.post('/api/teams/presence', { is_recording: recording, game })
    } catch { /* ignore */ }
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
