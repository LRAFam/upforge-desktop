import { beforeEach, describe, expect, it, vi } from 'vitest'
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'

vi.mock('electron', () => ({ session: { fromPartition: () => { throw new Error('use the fake jar') } } }))
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }))

import {
  applyWebShellCookie, clearWebShellSession, encodeAuthCookie, forgetWebShellToken, noteShellApiResponse,
  type CookieJar,
} from './web-shell-session'

const DESKTOP = '12|desktopdesktopdesktopdesktop01'
const SHELL_1 = '13|shellshellshellshellshellshell01'
const SHELL_2 = '14|shellshellshellshellshellshell02'
const BASE = 'https://upforge.gg'

type Reply = { status: number; data?: unknown } | 'network'
let replies: Reply[]
let sent: Array<{ method: string; url: string; auth: string | null }>

function fakeAuth(token: string | null = DESKTOP) {
  const api = axios.create({ baseURL: 'https://api.upforge.gg' })
  api.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    sent.push({
      method: String(config.method).toUpperCase(),
      url: String(config.url),
      auth: (config.headers?.get?.('Authorization') as string | undefined) ?? null,
    })
    const reply = replies.shift() ?? { status: 200, data: {} }
    if (reply === 'network') throw new AxiosError('timeout', 'ECONNABORTED', config)
    const response = { status: reply.status, statusText: '', data: reply.data ?? {}, headers: {}, config }
    const ok = config.validateStatus ? config.validateStatus(reply.status) : reply.status < 400
    if (!ok) throw new AxiosError(`Request failed with status code ${reply.status}`, 'ERR_BAD_REQUEST', config, null, response)
    return response
  }
  api.defaults.headers.common['Authorization'] = token ? `Bearer ${token}` : undefined
  return { getToken: () => token, getApi: () => api }
}

function fakeJar(initial: Record<string, string> = {}) {
  const cookies = new Map(Object.entries(initial))
  const jar: CookieJar = {
    get: async ({ name }) => (name && cookies.has(name) ? [{ name, value: cookies.get(name)! }] : []),
    set: vi.fn(async (d) => { cookies.set(d.name!, d.value!) }),
    remove: async (_url, name) => { cookies.delete(name) },
  }
  return { jar, cookies, clearStorageData: vi.fn(async () => { cookies.clear() }) }
}

const minted = (token: string) => ({ status: 200, data: { success: true, token } })

beforeEach(() => {
  forgetWebShellToken()
  replies = []
  sent = []
})

describe('web shell cookie', () => {
  it('uses a minted web-shell token, never the desktop token', async () => {
    replies = [minted(SHELL_1)]
    const { jar, cookies } = fakeJar()
    const res = await applyWebShellCookie(fakeAuth(), BASE, jar)

    expect(res.signedIn).toBe(true)
    expect(jar.set).toHaveBeenCalledWith(expect.objectContaining({ name: '__Host-upforge_session', secure: true, httpOnly: true, path: '/', sameSite: 'lax' }))
    expect(sent[0]).toMatchObject({ method: 'POST', url: '/api/auth/web-session', auth: `Bearer ${DESKTOP}` })
    expect(cookies.get('__Host-upforge_session')).toBe(SHELL_1)
    expect(cookies.get('__Host-upforge_session')).not.toBe(DESKTOP)
  })

  it('reuses the cached token while the cookie is still there', async () => {
    replies = [minted(SHELL_1)]
    const { jar, cookies } = fakeJar()
    await applyWebShellCookie(fakeAuth(), BASE, jar)
    await applyWebShellCookie(fakeAuth(), BASE, jar)
    expect(sent).toHaveLength(1)
    expect(cookies.get('__Host-upforge_session')).toBe(SHELL_1)
  })

  it('re-mints after the website logged out (cookie gone) or the shell got a 401', async () => {
    replies = [minted(SHELL_1), minted(SHELL_2), minted(SHELL_1)]
    const { jar, cookies } = fakeJar()
    await applyWebShellCookie(fakeAuth(), BASE, jar)

    cookies.delete('__Host-upforge_session') // website "Log out"
    await applyWebShellCookie(fakeAuth(), BASE, jar)
    expect(cookies.get('__Host-upforge_session')).toBe(SHELL_2)

    noteShellApiResponse(401)
    await applyWebShellCookie(fakeAuth(), BASE, jar)
    expect(sent).toHaveLength(3)
  })

  it.each([
    ['endpoint not deployed (404)', { status: 404 }],
    ['method not allowed (405)', { status: 405 }],
    ['refused (403)', { status: 403 }],
    ['server error (500)', { status: 500 }],
    ['network error', 'network' as const],
    ['reply without a token', { status: 200, data: { success: true } }],
    ['reply echoing the desktop token', minted(DESKTOP)],
  ])('%s → opens signed out and never injects the desktop token', async (_label, reply) => {
    replies = [reply as Reply]
    // Older builds left the desktop token in the persistent partition: it must be removed too.
    const { jar, cookies } = fakeJar({ auth_token: encodeAuthCookie(DESKTOP) })
    const res = await applyWebShellCookie(fakeAuth(), BASE, jar)

    expect(res.signedIn).toBe(false)
    expect(res.signedIn ? null : res.reason).toBeTruthy()
    expect(cookies.has('auth_token')).toBe(false)
  })

  it('a stale desktop-token cookie is replaced by the web-shell token', async () => {
    replies = [minted(SHELL_1)]
    const { jar, cookies } = fakeJar({ auth_token: encodeAuthCookie(DESKTOP) })
    await applyWebShellCookie(fakeAuth(), BASE, jar)
    expect(cookies.get('__Host-upforge_session')).toBe(SHELL_1)
    expect(cookies.has('auth_token')).toBe(false)
  })

  it('uses a non-Secure development cookie only for an HTTP frontend', async () => {
    replies = [minted(SHELL_1)]
    const { jar, cookies } = fakeJar()
    await applyWebShellCookie(fakeAuth(), 'http://localhost:3000', jar)
    expect(jar.set).toHaveBeenCalledWith(expect.objectContaining({ name: 'upforge_session', httpOnly: true, secure: false }))
    expect(cookies.get('upforge_session')).toBe(SHELL_1)
  })

  it('does not install a session minted while the desktop account changed', async () => {
    replies = [minted(SHELL_1)]
    const auth = fakeAuth()
    vi.spyOn(auth, 'getToken').mockReturnValueOnce(DESKTOP).mockReturnValue('99|anotherdesktopowner00000')
    const { jar, cookies } = fakeJar({ auth_token: encodeAuthCookie(DESKTOP) })
    expect(await applyWebShellCookie(auth, BASE, jar)).toEqual({ signedIn: false, reason: 'session_changed' })
    expect(cookies.size).toBe(0)
    expect(jar.set).not.toHaveBeenCalled()
  })

  it('not signed in → no request, no cookie', async () => {
    const { jar, cookies } = fakeJar()
    const res = await applyWebShellCookie(fakeAuth(null), BASE, jar)
    expect(res.signedIn).toBe(false)
    expect(sent).toHaveLength(0)
    expect(cookies.size).toBe(0)
  })
})

describe('desktop sign-out', () => {
  it('revokes the web-shell token and clears the shell partition', async () => {
    replies = [minted(SHELL_1), { status: 200 }]
    const { jar, cookies, clearStorageData } = fakeJar()
    const auth = fakeAuth()
    await applyWebShellCookie(auth, BASE, jar)

    await clearWebShellSession(auth, { cookies: jar, clearStorageData })

    expect(sent[1]).toMatchObject({ method: 'POST', url: '/api/logout', auth: `Bearer ${SHELL_1}` })
    expect(clearStorageData).toHaveBeenCalled()
    expect(cookies.size).toBe(0)

    // Next open mints again instead of reusing the revoked token.
    replies = [minted(SHELL_2)]
    await applyWebShellCookie(auth, BASE, jar)
    expect(cookies.get('__Host-upforge_session')).toBe(SHELL_2)
  })
})
