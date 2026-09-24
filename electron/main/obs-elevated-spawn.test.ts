import { EventEmitter } from 'events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('child_process', () => ({ spawn: vi.fn(), exec: vi.fn() }))
vi.mock('electron', () => ({ app: {}, shell: {} }))
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn() } }))
vi.mock('fs', () => ({ existsSync: vi.fn(() => true) }))
vi.mock('./obs-installer', () => ({
  candidateObsPaths: () => ['C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe'],
  installObsViaWinget: vi.fn(),
  isObsInstalled: () => true,
}))
vi.mock('./obs-crash-sentinel', () => ({ clearObsCrashSentinel: vi.fn() }))
vi.mock('./obs-profile-installer', () => ({
  obsLaunchArgs: () => ['--websocket_port=4455'],
  UPFORGE_OBS_DEFAULT_PORT: 4455,
  UPFORGE_OBS_DEFAULT_PASSWORD: 'test',
}))

import { spawn } from 'child_process'
import { restartObsStudioElevated } from './obs-launcher'

const permissionError = () => Object.assign(new Error('spawn EPERM'), { code: 'EPERM' })

describe('elevated OBS spawn failures', () => {
  beforeEach(() => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    vi.mocked(spawn).mockReset()
  })

  afterEach(() => vi.restoreAllMocks())

  it('returns a failed result when Windows synchronously blocks PowerShell', async () => {
    vi.mocked(spawn).mockImplementation(() => { throw permissionError() })

    await expect(restartObsStudioElevated()).resolves.toEqual({ ok: false, error: 'spawn EPERM' })
  })

  it('returns a failed result when PowerShell emits a spawn error', async () => {
    const child = new EventEmitter()
    vi.mocked(spawn).mockReturnValue(child as ReturnType<typeof spawn>)
    const result = restartObsStudioElevated()
    child.emit('error', permissionError())
    child.emit('close', -1)

    await expect(result).resolves.toEqual({ ok: false, error: 'spawn EPERM' })
  })

  it('waits for elevated restart completion before reporting success', async () => {
    const child = new EventEmitter()
    vi.mocked(spawn).mockReturnValue(child as ReturnType<typeof spawn>)
    const result = restartObsStudioElevated()
    child.emit('close', 0)

    await expect(result).resolves.toEqual({ ok: true })
  })

  it('returns a failed result when the administrator prompt is cancelled', async () => {
    const child = new EventEmitter()
    vi.mocked(spawn).mockReturnValue(child as ReturnType<typeof spawn>)
    const result = restartObsStudioElevated()
    child.emit('close', 1)

    await expect(result).resolves.toMatchObject({ ok: false, error: expect.stringContaining('cancelled') })
  })
})
