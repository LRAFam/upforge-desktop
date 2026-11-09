/**
 * Session for the embedded website window (web shell).
 *
 * The website signs out by deleting the token it holds (POST /api/logout). It used to hold the
 * desktop token, so any website logout — the button, a 401 auto-logout, a failed /api/user — also
 * signed the desktop app out. The shell now gets its own token from POST /api/auth/web-session
 * (minted with the desktop token). If that endpoint is missing or fails, the page opens signed out:
 * the desktop token is never put in the website's cookie.
 */

import { session } from 'electron'
import log from 'electron-log'
import type { AxiosInstance } from 'axios'

export const WEB_SHELL_PARTITION = 'persist:upforge-web'
const COOKIE = 'auth_token'
const TOKEN_SHAPE = /^\d+\|[A-Za-z0-9]{20,}$/

export interface CookieJar {
  get(filter: { url?: string; name?: string }): Promise<Array<{ name: string; value: string }>>
  set(details: Electron.CookiesSetDetails): Promise<void>
  remove(url: string, name: string): Promise<void>
}

interface ShellAuth {
  getToken(): string | null
  getApi(): AxiosInstance
}

export type WebShellCookieResult = { signedIn: true } | { signedIn: false; reason: string }

/** Web shell token for the current desktop token; memory only, re-minted when in doubt. */
let cached: { token: string; desktopToken: string } | null = null

export function encodeAuthCookie(token: string): string {
  return 'b64.' + Buffer.from(token, 'utf8').toString('base64')
}

export function forgetWebShellToken(): void {
  cached = null
}

/** The shell saw an API reply: a 401 means its token is gone, so mint a fresh one next time. */
export function noteShellApiResponse(statusCode: number): void {
  if (statusCode === 401) cached = null
}

function partitionJar(): CookieJar {
  return session.fromPartition(WEB_SHELL_PARTITION).cookies
}

async function mint(auth: ShellAuth, desktopToken: string): Promise<{ token: string } | { reason: string }> {
  try {
    const res = await auth.getApi().post('/api/auth/web-session', {}, {
      headers: { Authorization: `Bearer ${desktopToken}` },
      validateStatus: () => true, // every outcome is handled here; never a desktop sign-out
    })
    if (res.status === 404 || res.status === 405) return { reason: `endpoint_missing_${res.status}` }
    if (res.status !== 200) return { reason: `http_${res.status}` }
    const token = (res.data as { token?: unknown } | null)?.token
    if (typeof token !== 'string' || !TOKEN_SHAPE.test(token) || token === desktopToken) return { reason: 'bad_reply' }
    return { token }
  } catch (err) {
    return { reason: `network_${(err as { code?: string })?.code ?? 'error'}` }
  }
}

/**
 * Put the web-shell token in the shell's auth cookie (minting one if needed). On any failure the
 * cookie is removed — including a desktop token left there by older builds — and the page opens signed out.
 */
export async function applyWebShellCookie(
  auth: ShellAuth,
  frontendBase: string,
  jar: CookieJar = partitionJar(),
): Promise<WebShellCookieResult> {
  const desktopToken = auth.getToken()
  if (!desktopToken) return { signedIn: false, reason: 'not_signed_in' }

  const url = frontendBase.replace(/\/$/, '')
  const current = (await jar.get({ url, name: COOKIE }).catch(() => []))[0]?.value

  if (cached && cached.desktopToken === desktopToken && current === encodeAuthCookie(cached.token)) {
    return { signedIn: true }
  }

  const result = await mint(auth, desktopToken)
  if (!('token' in result)) {
    cached = null
    if (current !== undefined) await jar.remove(url, COOKIE).catch(() => {})
    log.warn('[WebShell] Could not get a website session; opening signed out (desktop token is never shared):', result.reason)
    return { signedIn: false, reason: result.reason }
  }

  cached = { token: result.token, desktopToken }
  await jar.set({
    url,
    name: COOKIE,
    value: encodeAuthCookie(result.token),
    path: '/',
    secure: url.startsWith('https://'),
    httpOnly: false,
    sameSite: 'lax',
    expirationDate: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
  })
  return { signedIn: true }
}

/** Desktop sign-out: revoke the web-shell token (best effort) and wipe the shell partition. */
export async function clearWebShellSession(
  auth: Pick<ShellAuth, 'getApi'>,
  ses: { cookies: CookieJar; clearStorageData(): Promise<void> } = session.fromPartition(WEB_SHELL_PARTITION),
): Promise<void> {
  const token = cached?.token
  cached = null
  if (token) {
    await auth.getApi().post('/api/logout', {}, {
      headers: { Authorization: `Bearer ${token}` },
      validateStatus: () => true,
    }).catch(() => {})
  }
  await ses.clearStorageData().catch((err: unknown) => {
    log.warn('[WebShell] Could not clear the website session:', (err as Error)?.message)
  })
}
