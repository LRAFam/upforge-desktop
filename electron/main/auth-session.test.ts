import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios'

const env = vi.hoisted(() => ({ dir: '', enc: false, decryptThrows: false }))
vi.mock('electron', () => ({
  app: { getPath: () => env.dir, getVersion: () => '9.9.9' },
  safeStorage: {
    isEncryptionAvailable: () => env.enc,
    encryptString: (s: string) => Buffer.from(`enc:${s}`, 'utf8'),
    decryptString: (b: Buffer) => {
      if (env.decryptThrows) throw new Error('keychain denied')
      return b.toString('utf8').replace(/^enc:/, '')
    },
  },
}))
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }))

import { AuthManager, loadToken } from './auth-manager'
import { readSignOutEvents, saveCachedUser } from './session-store'

const TOKEN = '12|abcdefghijklmnopqrstuvwxyz0123'
const USER = { id: 7, name: 'Ada', email: 'ada@example.com', tier: 'pro', is_admin: false, riot_name: 'Ada', riot_tag: 'EUW', riot_puuid: 'secret-ish' }

type Reply = { status: number; data?: unknown } | 'network'
let routes: Record<string, Reply>
let sent: Array<{ url: string; data: unknown; auth: string | null }>

function install(auth: AuthManager) {
  auth.getApi().defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    const url = (config.url ?? '').split('?')[0]
    const authHeader = (config.headers?.get?.('Authorization') as string | undefined) ?? null
    sent.push({ url, data: config.data ? JSON.parse(config.data as string) : null, auth: authHeader })
    const reply = routes[`${config.method?.toUpperCase()} ${url}`] ?? routes[url] ?? { status: 200, data: {} }
    if (reply === 'network') throw new AxiosError('timeout of 15000ms exceeded', 'ECONNABORTED', config)
    const response = { status: reply.status, statusText: '', data: reply.data ?? {}, headers: {}, config }
    if (reply.status >= 400) throw new AxiosError(`Request failed with status code ${reply.status}`, 'ERR_BAD_REQUEST', config, null, response)
    return response
  }
}

function writeToken(token = TOKEN) {
  fs.writeFileSync(path.join(env.dir, 'auth.enc'), env.enc ? `enc:${token}` : token)
}
const tokenFileExists = () => fs.existsSync(path.join(env.dir, 'auth.enc'))

beforeEach(() => {
  env.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upforge-auth-'))
  env.enc = false
  env.decryptThrows = false
  routes = {}
  sent = []
})
afterEach(() => {
  vi.useRealTimers()
  fs.rmSync(env.dir, { recursive: true, force: true })
})

describe('launch with a slow or offline network', () => {
  it('opens signed in with the saved user, keeps the token, and recovers once the server answers', async () => {
    writeToken()
    saveCachedUser(env.dir, USER)
    routes['/api/user'] = 'network'
    const auth = new AuthManager(); install(auth)

    expect(await auth.loadStoredToken()).toBe(true)
    expect(auth.isAuthenticated()).toBe(true)
    expect(auth.isUsingCachedUser()).toBe(true)
    expect(auth.getUser()?.name).toBe('Ada')
    expect(auth.getUser()?.email).toBe('') // never stored
    expect(tokenFileExists()).toBe(true)

    routes['/api/user'] = { status: 200, data: { user: USER } }
    expect(await auth.refreshUserNow()).toBe(true)
    expect(auth.isUsingCachedUser()).toBe(false)
    expect(auth.getUser()?.email).toBe('ada@example.com')
  }, 15_000)

  it('without a saved user it keeps the token for the next try instead of deleting it', async () => {
    writeToken()
    routes['/api/user'] = 'network'
    const auth = new AuthManager(); install(auth)

    expect(await auth.loadStoredToken()).toBe(false)
    expect(auth.getToken()).toBe(TOKEN)
    expect(tokenFileExists()).toBe(true)
    expect(readSignOutEvents(env.dir)).toEqual([])
  }, 15_000)

  it('a mid-session timeout keeps the session', async () => {
    writeToken()
    routes['/api/user'] = { status: 200, data: { user: USER } }
    const auth = new AuthManager(); install(auth)
    await auth.loadStoredToken()

    routes['/api/user'] = 'network'
    await auth.fetchUser()
    expect(auth.isAuthenticated()).toBe(true)
    expect(tokenFileExists()).toBe(true)
  }, 15_000)
})

describe('server rejections', () => {
  async function signedIn() {
    writeToken()
    routes['/api/user'] = { status: 200, data: { user: USER } }
    const auth = new AuthManager(); install(auth)
    const expired = vi.fn()
    auth.onSessionExpired = expired
    await auth.loadStoredToken()
    return { auth, expired }
  }

  it('ignores a late 401 for an older token', async () => {
    const { auth, expired } = await signedIn()
    routes['/api/stats'] = { status: 401 }
    const stale: AxiosRequestConfig = { headers: { Authorization: 'Bearer 1|oldoldoldoldoldoldoldold' } }
    await expect(auth.getApi().get('/api/stats', stale)).rejects.toBeTruthy()
    expect(auth.getToken()).toBe(TOKEN)
    expect(expired).not.toHaveBeenCalled()
  })

  it('a 401 for the current token ends the session once, with a reason and no secrets', async () => {
    const { auth, expired } = await signedIn()
    routes['/api/stats'] = { status: 401 }
    await expect(auth.getApi().get('/api/stats?season=5')).rejects.toBeTruthy()

    expect(auth.isAuthenticated()).toBe(false)
    expect(expired).toHaveBeenCalledTimes(1)
    expect(tokenFileExists()).toBe(false)
    const events = readSignOutEvents(env.dir)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ reason: 'http_401', endpoint: '/api/stats', status: 401, appVersion: '9.9.9' })
    const raw = fs.readFileSync(path.join(env.dir, 'signout-events.json'), 'utf8')
    expect(raw).not.toContain(TOKEN)
    expect(raw).not.toContain('ada@example.com')
    expect(fs.existsSync(path.join(env.dir, 'auth-user.json'))).toBe(false)
  })

  it('a 403 on the user endpoint signs out with its own reason', async () => {
    const { auth, expired } = await signedIn()
    routes['/api/user'] = { status: 403 }
    expect(await auth.fetchUser()).toBeNull()
    expect(expired).toHaveBeenCalledTimes(1)
    expect(readSignOutEvents(env.dir).map(e => e.reason)).toEqual(['user_403'])
  })

  it('signing out yourself is recorded but does not raise the expired-session alert', async () => {
    const { auth, expired } = await signedIn()
    await auth.logout()
    expect(expired).not.toHaveBeenCalled()
    expect(readSignOutEvents(env.dir).map(e => e.reason)).toEqual(['user_logout'])
  })
})

describe('sign-in', () => {
  it('sends a per-install device name that stays the same across sign-ins', async () => {
    routes['POST /api/login'] = { status: 200, data: { token: TOKEN, user: USER } }
    routes['/api/user'] = { status: 200, data: { user: USER } }
    const auth = new AuthManager(); install(auth)
    await auth.login('ada@example.com', 'pw')
    await auth.login('ada@example.com', 'pw')

    const names = sent.filter(s => s.url === '/api/login').map(s => (s.data as { device_name: string }).device_name)
    expect(names).toHaveLength(2)
    expect(names[0]).toMatch(/^desktop-[0-9a-f-]{36}$/)
    expect(names[1]).toBe(names[0])
  })

  it('sends queued sign-out reasons as desktop_signed_out after signing in, then empties the queue', async () => {
    writeToken()
    saveCachedUser(env.dir, USER)
    routes['/api/user'] = { status: 401 }
    const first = new AuthManager(); install(first)
    await first.loadStoredToken()
    expect(readSignOutEvents(env.dir).map(e => e.reason)).toEqual(['http_401'])

    routes['POST /api/login'] = { status: 200, data: { token: TOKEN, user: USER } }
    routes['/api/user'] = { status: 200, data: { user: USER } }
    const auth = new AuthManager(); install(auth)
    await auth.login('ada@example.com', 'pw')
    await vi.waitFor(() => expect(sent.some(s => s.url === '/api/funnel-events')).toBe(true))

    const posted = sent.find(s => s.url === '/api/funnel-events')!.data as { event: string; channel: string; properties: { reason: string } }
    expect(posted.event).toBe('desktop_signed_out')
    expect(posted.channel).toBe('desktop')
    expect(posted.properties.reason).toBe('http_401')
    await vi.waitFor(() => expect(readSignOutEvents(env.dir)).toEqual([]))
  })
})

describe('reading the saved session', () => {
  it('records decrypt_failed when the keychain refuses and there was a session before', async () => {
    env.enc = true
    writeToken()
    saveCachedUser(env.dir, USER)
    env.decryptThrows = true
    const auth = new AuthManager(); install(auth)

    expect(await auth.loadStoredToken()).toBe(false)
    expect(readSignOutEvents(env.dir).map(e => e.reason)).toEqual(['decrypt_failed'])
  })

  it('still reads a token that was saved as plain text before encryption was available', () => {
    env.enc = true
    env.decryptThrows = true
    fs.writeFileSync(path.join(env.dir, 'auth.enc'), TOKEN)
    expect(loadToken()).toEqual({ token: TOKEN, failure: null })
  })

  it('a fresh install with no session records nothing', async () => {
    const auth = new AuthManager(); install(auth)
    expect(await auth.loadStoredToken()).toBe(false)
    expect(readSignOutEvents(env.dir)).toEqual([])
  })
})
