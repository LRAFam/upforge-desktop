import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ execFile: vi.fn(), exec: vi.fn() }))
vi.mock('child_process', () => mocks)
vi.mock('electron-log', () => ({ default: { debug: vi.fn(), info: vi.fn() } }))
const platform = Object.getOwnPropertyDescriptor(process, 'platform')!
beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  Object.defineProperty(process, 'platform', { value: 'win32' })
})
afterEach(() => Object.defineProperty(process, 'platform', platform))

it('passes a valid multiline PowerShell script directly, without cmd quoting', async () => {
  mocks.execFile.mockImplementation((_exe, _args, _options, callback) => {
    callback(null, 'Counter-Strike 2:SDL_app:cs2.exe\r\n')
  })
  const { findObsWindowString } = await import('./game-window-finder')
  await expect(findObsWindowString('cs2')).resolves.toBe('Counter-Strike 2:SDL_app:cs2.exe')
  const [exe, args, options] = mocks.execFile.mock.calls[0]
  expect(exe).toBe('powershell.exe')
  expect(args.slice(0, 3)).toEqual(['-NoProfile', '-NonInteractive', '-EncodedCommand'])
  const script = Buffer.from(args[3], 'base64').toString('utf16le')
  expect(script).toContain('Add-Type -TypeDefinition @"\nusing System;')
  expect(script).toContain('\n}\n"@\n')
  expect(script).toContain("Get-Process -Name 'cs2'")
  expect(options).toMatchObject({ windowsHide: true, timeout: 8000 })
  expect(mocks.exec).not.toHaveBeenCalled()
})

it('does not reject when Windows refuses to spawn the lookup process', async () => {
  const denied = () => { throw Object.assign(new Error('spawn EPERM'), { code: 'EPERM' }) }
  mocks.execFile.mockImplementation(denied)
  mocks.exec.mockImplementation(denied)
  const { findObsWindowString } = await import('./game-window-finder')
  await expect(findObsWindowString('cs2')).resolves.toBeNull()
})

it('handles an asynchronous process failure without inventing a live window', async () => {
  mocks.execFile.mockImplementation((_exe, _args, _options, callback) => callback(new Error('access denied'), ''))
  const { findObsWindowString } = await import('./game-window-finder')
  await expect(findObsWindowString('deadlock')).resolves.toBeNull()
})

it('has a dedicated League of Legends window string', async () => {
  const { OBS_WINDOW_FALLBACKS } = await import('./game-window-finder')
  expect(OBS_WINDOW_FALLBACKS.lol).toContain('League of Legends.exe')
  expect(OBS_WINDOW_FALLBACKS.lol).not.toEqual(OBS_WINDOW_FALLBACKS.valorant)
})

it('keeps the League capture fallback when no game window is visible', async () => {
  mocks.execFile.mockImplementation((_exe, _args, _options, callback) => callback(null, ''))
  const { resolveObsCaptureWindow } = await import('./game-window-finder')
  const resolved = await resolveObsCaptureWindow('lol')
  expect(resolved).toContain('League of Legends')
  expect(resolved).not.toContain('VALORANT')
})


it('targets the executable used by the Overstep Development playtest', async () => {
  mocks.execFile.mockImplementation((_exe, _args, _options, callback) => callback(null, 'Overstep:UnrealWindow:Overstep.exe'))
  const { resolveObsCaptureWindow } = await import('./game-window-finder')
  await expect(resolveObsCaptureWindow('overstep')).resolves.toBe('Overstep:UnrealWindow:Overstep.exe')
  const script = Buffer.from(mocks.execFile.mock.calls[0][1][3], 'base64').toString('utf16le')
  expect(script).toContain("Get-Process -Name 'Overstep'")
  expect(script).toContain("[UpForgeWin]::Find($pids, 'Overstep.exe')")
})

it('fails closed when no Overstep window is visible', async () => {
  mocks.execFile.mockImplementation((_exe, _args, _options, callback) => callback(null, ''))
  const { resolveObsCaptureWindow } = await import('./game-window-finder')
  await expect(resolveObsCaptureWindow('overstep')).rejects.toThrow('Overstep game window was not found')
})
