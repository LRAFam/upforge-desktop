import axios, { AxiosInstance } from 'axios'
import keytar from 'keytar'

const SERVICE_NAME = 'UpForge'
const ACCOUNT_NAME = 'auth_token'
const API_BASE = 'https://api.upforge.gg'

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
    analysis_stats: { total: number; limit: number | null }
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
      const token = await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME)
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
    try {
      const res = await this._api.post('/api/login', { email, password })
      const { token, user } = res.data

      this._token = token
      this._user = user
      this._api.defaults.headers.common['Authorization'] = `Bearer ${token}`

      await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, token)
      return { ok: true }
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message || 'Login failed'
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
    await keytar.deletePassword(SERVICE_NAME, ACCOUNT_NAME)
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
      return {
        user: p.user,
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
