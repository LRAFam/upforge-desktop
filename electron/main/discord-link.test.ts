import { describe, expect, it, vi } from 'vitest'
import { isDiscordAuthorizeUrl, startDiscordLink } from './discord-link'

const AUTH_URL = 'https://discord.com/oauth2/authorize?client_id=1&response_type=code&scope=identify&state=abc'

describe('isDiscordAuthorizeUrl', () => {
  it('accepts only Discord https authorise pages', () => {
    expect(isDiscordAuthorizeUrl(AUTH_URL)).toBe(true)
    expect(isDiscordAuthorizeUrl('http://discord.com/oauth2/authorize')).toBe(false)
    expect(isDiscordAuthorizeUrl('https://evil.example/oauth2/authorize')).toBe(false)
    expect(isDiscordAuthorizeUrl('https://discord.com.evil.example/oauth2/authorize')).toBe(false)
    expect(isDiscordAuthorizeUrl('https://discord.com/channels/1')).toBe(false)
    expect(isDiscordAuthorizeUrl(null)).toBe(false)
    expect(isDiscordAuthorizeUrl('not a url')).toBe(false)
  })
})

describe('startDiscordLink', () => {
  it('asks the API for the authorise URL and opens it in the browser', async () => {
    const get = vi.fn().mockResolvedValue({ status: 200, data: { url: AUTH_URL } })
    const openExternal = vi.fn()
    const res = await startDiscordLink({ get, openExternal })
    expect(get).toHaveBeenCalledWith('/api/auth/discord/redirect')
    expect(openExternal).toHaveBeenCalledWith(AUTH_URL)
    expect(res).toEqual({ ok: true })
  })

  it('never opens a non-Discord URL from the API', async () => {
    const openExternal = vi.fn()
    const res = await startDiscordLink({ get: vi.fn().mockResolvedValue({ status: 200, data: { url: 'https://evil.example/x' } }), openExternal })
    expect(openExternal).not.toHaveBeenCalled()
    expect(res.ok).toBe(false)
  })

  it('explains logged out, rate limited, misconfigured and network failures', async () => {
    const openExternal = vi.fn()
    expect(await startDiscordLink({ get: null, openExternal })).toEqual({ ok: false, error: 'Sign in again to link Discord.' })
    expect(await startDiscordLink({ get: vi.fn().mockResolvedValue({ status: 429, data: {} }), openExternal }))
      .toEqual({ ok: false, error: 'Too many link attempts. Try again in an hour.' })
    expect((await startDiscordLink({ get: vi.fn().mockResolvedValue({ status: 503, data: { message: 'x' } }), openExternal })).ok).toBe(false)
    expect((await startDiscordLink({ get: vi.fn().mockRejectedValue(new Error('net')), openExternal })).ok).toBe(false)
    expect(openExternal).not.toHaveBeenCalled()
  })
})
