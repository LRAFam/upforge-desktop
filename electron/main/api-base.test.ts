import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const electron = vi.hoisted(() => ({ app: { isPackaged: true } }))
vi.mock('electron', () => electron)

import { getApiBaseUrl, getFrontendBaseUrl } from './api-base'

afterEach(() => {
  vi.unstubAllEnvs()
  electron.app.isPackaged = true
})

describe('getApiBaseUrl (card 44)', () => {
  it('ignores a non-local VITE_API_URL in a packaged build', () => {
    vi.stubEnv('VITE_API_URL', 'https://evil.example')
    expect(getApiBaseUrl()).toBe('https://api.upforge.gg')
  })

  it('ignores look-alike hosts in a packaged build', () => {
    for (const evil of ['https://localhost.evil.example', 'https://127.0.0.1.evil.example', 'not a url', 'file:///etc/passwd']) {
      vi.stubEnv('VITE_API_URL', evil)
      expect(getApiBaseUrl(), evil).toBe('https://api.upforge.gg')
    }
  })

  it('keeps a localhost override in a packaged build', () => {
    vi.stubEnv('VITE_API_URL', 'http://localhost:8000/')
    expect(getApiBaseUrl()).toBe('http://localhost:8000')
    vi.stubEnv('VITE_API_URL', 'http://127.0.0.1:8000')
    expect(getApiBaseUrl()).toBe('http://127.0.0.1:8000')
  })

  it('keeps any override in a dev build', () => {
    electron.app.isPackaged = false
    vi.stubEnv('VITE_API_URL', 'https://staging.example')
    expect(getApiBaseUrl()).toBe('https://staging.example')
  })

  it('falls back to production when unset', () => {
    vi.stubEnv('VITE_API_URL', '')
    expect(getApiBaseUrl()).toBe('https://api.upforge.gg')
  })
})

describe('getFrontendBaseUrl (card 44)', () => {
  it('applies the same packaged rules', () => {
    vi.stubEnv('VITE_FRONTEND_URL', 'https://evil.example')
    expect(getFrontendBaseUrl()).toBe('https://upforge.gg')
    vi.stubEnv('VITE_FRONTEND_URL', 'http://localhost:3000')
    expect(getFrontendBaseUrl()).toBe('http://localhost:3000')
    electron.app.isPackaged = false
    vi.stubEnv('VITE_FRONTEND_URL', 'https://preview.example')
    expect(getFrontendBaseUrl()).toBe('https://preview.example')
  })
})

describe('no direct env reads', () => {
  const root = join(__dirname, '..')
  const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return files(p)
    return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) && !p.endsWith('api-base.ts') ? [p] : []
  })
  it('routes every VITE_API_URL / VITE_FRONTEND_URL read through api-base', () => {
    const offenders = files(root).filter((f) => /process\.env(\.|\[['"])VITE_(API|FRONTEND)_URL/.test(readFileSync(f, 'utf8')))
    expect(offenders.map((f) => relative(root, f))).toEqual([])
  })
})
