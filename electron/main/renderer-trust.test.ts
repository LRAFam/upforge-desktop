import { describe, expect, it } from 'vitest'
import { isTrustedExternalUrl, isTrustedRendererUrl } from './renderer-trust'

describe('isTrustedRendererUrl', () => {
  it('allows routes on the configured renderer entry only', () => {
    const entry = 'http://127.0.0.1:5173/'
    expect(isTrustedRendererUrl('http://127.0.0.1:5173/#/post-game', entry)).toBe(true)
    expect(isTrustedRendererUrl('https://evil.example/', entry)).toBe(false)
    expect(isTrustedRendererUrl('http://127.0.0.1:5173/other.html', entry)).toBe(false)
  })

  it('allows the packaged file with a hash but not another local file', () => {
    const entry = 'file:///app/renderer/index.html'
    expect(isTrustedRendererUrl('file:///app/renderer/index.html#/post-game', entry)).toBe(true)
    expect(isTrustedRendererUrl('file:///tmp/hostile.html', entry)).toBe(false)
  })
})

describe('isTrustedExternalUrl', () => {
  it('allows only the HTTPS destinations used by the desktop app', () => {
    expect(isTrustedExternalUrl('https://upforge.gg/progress?from=desktop')).toBe(true)
    expect(isTrustedExternalUrl('https://www.upforge.gg/pricing')).toBe(true)
    expect(isTrustedExternalUrl('https://discord.gg/MDD3WVRaEq')).toBe(true)
  })

  it('rejects custom schemes, credentials, control characters, and lookalike hosts', () => {
    expect(isTrustedExternalUrl('steam://run/123')).toBe(false)
    expect(isTrustedExternalUrl('file:///tmp/secret')).toBe(false)
    expect(isTrustedExternalUrl('https://user:pass@upforge.gg/')).toBe(false)
    expect(isTrustedExternalUrl('https://upforge.gg.evil.example/')).toBe(false)
    expect(isTrustedExternalUrl('https://upforge.gg/\nmalicious')).toBe(false)
  })
})
