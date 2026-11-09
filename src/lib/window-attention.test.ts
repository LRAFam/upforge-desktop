import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function stubWindow() {
  const listeners = new Map<string, Set<() => void>>()
  const on = (n: string, cb: () => void) => { const s = listeners.get(n) ?? new Set(); s.add(cb); listeners.set(n, s) }
  const doc = { hidden: false, focused: true, hasFocus: () => doc.focused, addEventListener: on, removeEventListener: () => {} }
  vi.stubGlobal('window', { addEventListener: on, removeEventListener: () => {} })
  vi.stubGlobal('document', doc)
  const fire = (n: string) => listeners.get(n)?.forEach(cb => cb())
  return { doc, fire }
}

describe('window attention', () => {
  beforeEach(() => { vi.resetModules() })
  afterEach(() => { vi.unstubAllGlobals() })

  it('is false while the game has focus (window visible but blurred) and while hidden', async () => {
    const { useWindowAttention, windowIsBackground } = await import('./window-attention') // installs lazily
    const { doc, fire } = stubWindow()
    const attention = useWindowAttention()
    expect(attention.value).toBe(true)
    doc.focused = false; fire('blur')
    expect(attention.value).toBe(false)
    expect(windowIsBackground()).toBe(true)
    doc.focused = true; fire('focus')
    expect(attention.value).toBe(true)
    doc.hidden = true; fire('visibilitychange')
    expect(attention.value).toBe(false)
  })
})

describe('app shell in the background', () => {
  const app = readFileSync(join(__dirname, '../App.vue'), 'utf8').replace(/\r\n/g, '\n')
  const css = readFileSync(join(__dirname, '../assets/main.css'), 'utf8').replace(/\r\n/g, '\n')

  it('pauses every infinite animation while the window is in the background', () => {
    expect(app).toMatch(/'uf-still': !windowAttention/)
    expect(css).toMatch(/\.uf-still \*,\s*\.uf-still \*::before,\s*\.uf-still \*::after \{\s*animation-play-state: paused !important;/)
  })

  it('skips the 5 s shell status poll while unfocused, not only when hidden', () => {
    const poll = app.slice(app.indexOf('statusInterval = setInterval('), app.indexOf('}, 5000)', app.indexOf('statusInterval = setInterval(')))
    expect(poll).toMatch(/if \(!windowAttention\.value\) return/)
    expect(poll).not.toMatch(/document\.hidden/)
  })
})
