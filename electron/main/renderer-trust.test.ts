import { describe, expect, it } from 'vitest'
import { isTrustedRendererUrl } from './renderer-trust'

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
