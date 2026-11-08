import { describe, expect, it, vi } from 'vitest'

const openExternal = vi.fn()
vi.mock('electron', () => ({
  BrowserWindow: class {},
  Menu: { buildFromTemplate: vi.fn(), setApplicationMenu: vi.fn() },
  shell: { openExternal: (u: string) => openExternal(u) },
  session: { fromPartition: vi.fn() },
  app: { getPath: () => '/tmp', getVersion: () => '0.0.0', isPackaged: false },
  safeStorage: { isEncryptionAvailable: () => false },
}))
vi.mock('./auth-manager', () => ({ AuthManager: class {} }))

import { openExternalFromShell } from './web-shell'
import { isSafeExternalUrl } from './renderer-trust'

const FRONTEND = 'https://upforge.gg'

describe('web shell external links', () => {
  it.each([
    'file:///C:/Windows/System32/calc.exe',
    'ms-msdt:/id PCWDiagnostic /skip force',
    'smb://evil.example/share',
    'javascript:alert(1)',
    'steam://run/730',
    'http://example.com/',
    'https://user:pass@example.com/',
    'not a url',
  ])('denies %s', (url) => {
    const open = vi.fn()
    expect(openExternalFromShell(url, FRONTEND, open)).toBe(false)
    expect(open).not.toHaveBeenCalled()
  })

  it('opens https://example.com', () => {
    const open = vi.fn()
    expect(openExternalFromShell('https://example.com', FRONTEND, open)).toBe(true)
    expect(open).toHaveBeenCalledWith('https://example.com')
  })

  it('default opener goes through shell.openExternal only for safe URLs', () => {
    openExternal.mockClear()
    openExternalFromShell('file:///C:/', FRONTEND)
    expect(openExternal).not.toHaveBeenCalled()
    openExternalFromShell('https://example.com/a', FRONTEND)
    expect(openExternal).toHaveBeenCalledWith('https://example.com/a')
  })

  it('allows http only for the configured (local dev) frontend host', () => {
    const open = vi.fn()
    expect(openExternalFromShell('http://localhost:3000/progress', 'http://localhost:3000', open)).toBe(true)
    expect(openExternalFromShell('http://example.com/', 'http://localhost:3000', open)).toBe(false)
    expect(isSafeExternalUrl('http://localhost:3000/')).toBe(false)
  })
})
