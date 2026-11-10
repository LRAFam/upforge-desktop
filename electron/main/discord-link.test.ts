import { describe, expect, it, vi } from 'vitest'
import { DiscordLinkFlow, DISCORD_LINK_TTL_MS, isDiscordAuthorizeUrl, parseDiscordLinkCallback } from './discord-link'

const STATE = 'desktop.12345678-1234-1234-1234-123456789abc'
const AUTH_URL = `https://discord.com/oauth2/authorize?client_id=1&response_type=code&scope=identify&state=${STATE}`
const CALLBACK = { state: STATE, code: 'oauth-code_1' }
const LINK = `upforge://discord/callback?state=${STATE}&code=oauth-code_1`
function harness() {
  let session: { userId: number; token: string } | null = { userId: 12, token: 'test-only-token' }
  let now = 1000
  const get = vi.fn().mockResolvedValue({ status: 200, data: { url: AUTH_URL } })
  const post = vi.fn().mockResolvedValue({ status: 200, data: { success: true } })
  const open = vi.fn()
  const flow = new DiscordLinkFlow({ session: () => session, get, post, now: () => now })
  return { flow, get, post, open, session: (s: typeof session) => { session = s }, time: (n: number) => { now = n } }
}

describe('Discord callback boundary', () => {
  it('accepts the exact callback and rejects ambiguous or arbitrary navigation', () => {
    expect(parseDiscordLinkCallback(LINK)).toEqual(CALLBACK)
    for (const raw of [LINK + '&code=second', LINK + '&state=' + STATE, LINK + '&redirect=https://evil.example', LINK + '#x',
      LINK.replace('/callback', '/other/../callback'), LINK.replace('discord/', 'user@discord/'),
      LINK.replace('oauth-code_1', 'a%0Ab'), LINK.replace('desktop.', ''), LINK.replace('upforge:', 'https:'),
      LINK.replace('/callback', '/callback/'), LINK.replace('discord/', 'discord:9/'), 'upforge://discord/callback', null]) {
      expect(parseDiscordLinkCallback(raw), String(raw)).toBeNull()
    }
  })
  it('only opens exact Discord HTTPS authorize pages', () => {
    expect(isDiscordAuthorizeUrl(AUTH_URL)).toBe(true)
    for (const url of ['http://discord.com/oauth2/authorize', 'https://evil.example/oauth2/authorize',
      'https://discord.com.evil.example/oauth2/authorize', 'https://discord.com/oauth2/authorize-extra',
      'https://user@discord.com/oauth2/authorize', 'https://discord.com:123/oauth2/authorize', null, 'not a url']) {
      expect(isDiscordAuthorizeUrl(url)).toBe(false)
    }
  })
})

describe('Discord session ownership', () => {
  it('returns through the initiating desktop and sends its captured bearer once', async () => {
    const h = harness()
    expect(await h.flow.start(h.open)).toEqual({ ok: true })
    expect(h.get).toHaveBeenCalledWith('/api/auth/discord/redirect?client=desktop', 'test-only-token')
    expect(h.open).toHaveBeenCalledWith(AUTH_URL)
    expect(await h.flow.complete(CALLBACK)).toEqual({ ok: true })
    expect(h.post).toHaveBeenCalledWith('/api/auth/discord/callback', CALLBACK, 'test-only-token')
    expect((await h.flow.complete(CALLBACK))?.ok).toBe(false)
    expect(h.post).toHaveBeenCalledTimes(1)
  })
  it('rejects unsolicited callbacks and wrong state without consuming the genuine request', async () => {
    const h = harness()
    expect((await h.flow.complete(CALLBACK))?.ok).toBe(false)
    await h.flow.start(h.open)
    expect((await h.flow.complete({ ...CALLBACK, state: STATE.replace('12345678', '87654321') }))?.ok).toBe(false)
    expect(h.post).not.toHaveBeenCalled()
    expect(await h.flow.complete(CALLBACK)).toEqual({ ok: true })
  })
  it.each(['account', 'token', 'logout', 'expiry', 'clear'] as const)('blocks %s changes before exchange', async change => {
    const h = harness()
    await h.flow.start(h.open)
    if (change === 'account') h.session({ userId: 99, token: 'test-only-token' })
    if (change === 'token') h.session({ userId: 12, token: 'replacement-token' })
    if (change === 'logout') h.session(null)
    if (change === 'expiry') h.time(1000 + DISCORD_LINK_TTL_MS)
    if (change === 'clear') h.flow.clear()
    expect((await h.flow.complete(CALLBACK))?.ok).toBe(false)
    expect(h.post).not.toHaveBeenCalled()
  })
  it('does not open a delayed redirect after the session changes', async () => {
    const h = harness()
    let resolve!: (value: unknown) => void
    h.get.mockReturnValue(new Promise(r => { resolve = r }))
    const pending = h.flow.start(h.open)
    h.session({ userId: 99, token: 'replacement-token' })
    resolve({ status: 200, data: { url: AUTH_URL } })
    expect((await pending).ok).toBe(false)
    expect(h.open).not.toHaveBeenCalled()
  })
  it('ignores stale responses and concurrent duplicate callbacks', async () => {
    const h = harness()
    await h.flow.start(h.open)
    let resolve!: (value: unknown) => void
    h.post.mockReturnValue(new Promise(r => { resolve = r }))
    const pending = h.flow.complete(CALLBACK)
    expect(await h.flow.complete(CALLBACK)).toBeNull()
    h.session({ userId: 99, token: 'replacement-token' })
    resolve({ status: 200, data: { success: true } })
    expect(await pending).toBeNull()
    expect(h.post).toHaveBeenCalledTimes(1)
  })
  it('can retry a lost response against the same owner-bound API result', async () => {
    const h = harness()
    await h.flow.start(h.open)
    h.post.mockRejectedValueOnce(new Error('network'))
    expect((await h.flow.complete(CALLBACK))?.ok).toBe(false)
    expect(await h.flow.complete(CALLBACK)).toEqual({ ok: true })
  })
  it('fails closed on old-service state, invalid response, logout and unavailable browser', async () => {
    const h = harness()
    h.get.mockResolvedValueOnce({ status: 200, data: { url: AUTH_URL.replace('desktop.', '') } })
    expect((await h.flow.start(h.open)).ok).toBe(false)
    expect(h.open).not.toHaveBeenCalled()
    h.session(null)
    expect((await h.flow.start(h.open)).ok).toBe(false)
    h.session({ userId: 12, token: 'test-only-token' })
    h.open.mockRejectedValueOnce(new Error('browser'))
    expect((await h.flow.start(h.open)).ok).toBe(false)
    expect((await h.flow.complete(CALLBACK))?.ok).toBe(false)
    h.get.mockResolvedValueOnce({ status: 429, data: {} })
    expect(await h.flow.start(h.open)).toEqual({ ok: false, error: 'Too many link attempts. Try again in an hour.' })
  })
})
