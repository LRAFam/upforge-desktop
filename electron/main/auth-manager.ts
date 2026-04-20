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

export class AuthManager {
  private _token: string | null = null
  private _user: AuthUser | null = null
  private _api: AxiosInstance

  constructor() {
    this._api = axios.create({
      baseURL: API_BASE,
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

  async login(email: string, password: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await this._api.post('/api/auth/login', { email, password })
      const { token, user } = res.data

      this._token = token
      this._user = user
      this._api.defaults.headers.common['Authorization'] = `Bearer ${token}`

      await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, token)
      return { success: true }
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message || 'Login failed'
      return { success: false, error: message }
    }
  }

  async logout(): Promise<void> {
    try {
      await this._api.post('/api/auth/logout')
    } catch { /* ignore */ }

    this._token = null
    this._user = null
    delete this._api.defaults.headers.common['Authorization']
    await keytar.deletePassword(SERVICE_NAME, ACCOUNT_NAME)
  }

  async fetchUser(): Promise<AuthUser | null> {
    try {
      const res = await this._api.get('/api/auth/user')
      this._user = res.data
      return this._user
    } catch {
      this._token = null
      this._user = null
      return null
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
