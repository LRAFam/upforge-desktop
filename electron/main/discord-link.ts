/** Discord linking stays bound to the desktop session that started it. */
export interface DiscordLinkSession { userId: number; token: string }
export interface DiscordLinkResponse { status: number; data: unknown }
export interface DiscordLinkDeps {
  session: () => DiscordLinkSession | null
  get: (path: string, token: string) => Promise<DiscordLinkResponse>
  post: (path: string, body: { code: string; state: string }, token: string) => Promise<DiscordLinkResponse>
  now?: () => number
}
export type DiscordLinkResult = { ok: true } | { ok: false; error: string }
export interface DiscordLinkCallback { code: string; state: string }
export const DISCORD_LINK_TTL_MS = 15 * 60 * 1000
const DESKTOP_STATE = /^desktop\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Only Discord's exact HTTPS authorise page may be opened from the API answer. */
export function isDiscordAuthorizeUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 4096) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash
      && (url.hostname === 'discord.com' || url.hostname === 'discordapp.com')
      && url.pathname === '/oauth2/authorize'
  } catch { return false }
}

/** This sensitive callback is handled in main; it is never forwarded to a renderer. */
export function parseDiscordLinkCallback(raw: unknown): DiscordLinkCallback | null {
  if (typeof raw !== 'string' || raw.length > 4096 || /[%\s#\\]/.test(raw)
    || !raw.startsWith('upforge://discord/callback?')) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'upforge:' || url.hostname !== 'discord' || url.pathname !== '/callback'
      || url.username || url.password || url.port || url.hash) return null
    if ([...url.searchParams.keys()].some(key => key !== 'code' && key !== 'state')) return null
    if (url.searchParams.getAll('code').length !== 1 || url.searchParams.getAll('state').length !== 1) return null
    const code = url.searchParams.get('code')!
    const state = url.searchParams.get('state')!
    if (!/^[A-Za-z0-9_-]{1,2048}$/.test(code) || !DESKTOP_STATE.test(state)) return null
    return { code, state }
  } catch { return null }
}

function sameSession(a: DiscordLinkSession | null, b: DiscordLinkSession): boolean {
  return a?.userId === b.userId && a.token === b.token
}

export class DiscordLinkFlow {
  private generation = 0
  private pending: { state: string; session: DiscordLinkSession; startedAt: number; exchanging: boolean } | null = null
  constructor(private readonly deps: DiscordLinkDeps) {}

  clear(): void { this.generation++; this.pending = null }

  async start(openExternal: (url: string) => Promise<void> | void): Promise<DiscordLinkResult> {
    this.clear()
    const generation = this.generation
    const session = this.deps.session()
    if (!session) return { ok: false, error: 'Sign in again to link Discord.' }
    let res: DiscordLinkResponse
    try { res = await this.deps.get('/api/auth/discord/redirect?client=desktop', session.token) }
    catch { return { ok: false, error: 'Could not reach UpForge. Try again in a moment.' } }
    if (generation !== this.generation || !sameSession(this.deps.session(), session)) {
      return { ok: false, error: 'Your session changed. Start Discord linking again.' }
    }
    const data = res.data as { url?: unknown } | null
    if (res.status === 429) return { ok: false, error: 'Too many link attempts. Try again in an hour.' }
    if (res.status < 200 || res.status >= 300 || !isDiscordAuthorizeUrl(data?.url)) {
      return { ok: false, error: 'Discord linking is unavailable right now. Try again later.' }
    }
    const params = new URL(data.url).searchParams
    const state = params.get('state')
    if (!state || !DESKTOP_STATE.test(state) || params.getAll('state').length !== 1) {
      return { ok: false, error: 'Discord linking needs the latest UpForge service. Try again later.' }
    }
    const pending = { state, session: { ...session }, startedAt: (this.deps.now ?? Date.now)(), exchanging: false }
    this.pending = pending
    try { await openExternal(data.url) }
    catch {
      if (this.pending === pending) this.pending = null
      return { ok: false, error: 'Could not open Discord. Start linking again.' }
    }
    return { ok: true }
  }

  async complete(callback: DiscordLinkCallback): Promise<DiscordLinkResult | null> {
    const pending = this.pending
    if (!pending || pending.state !== callback.state) {
      return { ok: false, error: 'Start Discord linking from this app, then keep it open until you return.' }
    }
    if (!sameSession(this.deps.session(), pending.session)
      || (this.deps.now ?? Date.now)() - pending.startedAt >= DISCORD_LINK_TTL_MS) {
      this.pending = null
      return { ok: false, error: 'This link request expired or your session changed. Start linking again.' }
    }
    if (pending.exchanging) return null
    pending.exchanging = true
    try {
      const res = await this.deps.post('/api/auth/discord/callback', callback, pending.session.token)
      if (this.pending !== pending || !sameSession(this.deps.session(), pending.session)) return null
      if (res.status >= 200 && res.status < 300 && (res.data as { success?: unknown } | null)?.success === true) {
        this.pending = null
        return { ok: true }
      }
      if (res.status < 500) this.pending = null
      return { ok: false, error: res.status === 409
        ? 'That Discord account is already linked. Use another account or unlink it first.'
        : 'Discord could not be linked. Start linking again from Settings.' }
    } catch {
      if (this.pending !== pending || !sameSession(this.deps.session(), pending.session)) return null
      return { ok: false, error: 'Could not reach UpForge. Return from the browser to try again.' }
    } finally { pending.exchanging = false }
  }
}
