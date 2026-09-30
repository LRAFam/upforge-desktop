import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ execFile: vi.fn() }))
vi.mock('child_process', () => ({ execFile: mocks.execFile }))
vi.mock('electron-log', () => ({ default: { info: vi.fn(), debug: vi.fn() } }))

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
  mocks.execFile.mockReset()
})

describe('Windows game window lookup', () => {
  it('passes a multiline PowerShell script without shell interpretation', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    mocks.execFile.mockImplementation((_file, _args, _options, callback) => {
      callback(null, 'VALORANT  :UnrealWindow:VALORANT-Win64-Shipping.exe\r\n')
    })
    const { findObsWindowString } = await import('./game-window-finder')
    expect(await findObsWindowString('valorant')).toBe('VALORANT  :UnrealWindow:VALORANT-Win64-Shipping.exe')
    const [file, args, options] = mocks.execFile.mock.calls[0]
    expect(file).toBe('powershell.exe')
    expect(args.slice(0, 3)).toEqual(['-NoProfile', '-NonInteractive', '-EncodedCommand'])
    const script = Buffer.from(args[3], 'base64').toString('utf16le')
    expect(script).toContain('Add-Type -TypeDefinition @"\nusing System;')
    expect(script).toContain('\n}\n"@\n$procs')
    expect(script).toContain("Get-Process -Name 'VALORANT-Win64-Shipping'")
    expect(options.shell).not.toBe(true)
    expect(options.windowsHide).toBe(true)
  })

  it('returns no window when lookup fails', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    mocks.execFile.mockImplementation((_file, _args, _options, callback) => callback(new Error('lookup failed'), ''))
    const { findObsWindowString } = await import('./game-window-finder')
    expect(await findObsWindowString('valorant')).toBeNull()
  })
})
