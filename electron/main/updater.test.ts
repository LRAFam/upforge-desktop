import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron-updater', () => ({
  autoUpdater: {
    logger: null,
    autoDownload: true,
    autoInstallOnAppQuit: true,
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    on: vi.fn(),
  },
}))

vi.mock('electron', () => ({
  app: { isPackaged: true },
  BrowserWindow: { getAllWindows: () => [] },
}))

vi.mock('./app-notifications', () => ({ showAppNotification: vi.fn() }))
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { autoUpdater } from 'electron-updater'
import { getUpdateState, setupAutoUpdater, setUpdateActivityGuard, shouldDeferUpdateWork } from './updater'

describe('update activity guard', () => {
  beforeEach(() => setUpdateActivityGuard(() => false))
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })

  it('defers update work while a game or recording is active', () => {
    setUpdateActivityGuard(() => true)
    expect(shouldDeferUpdateWork()).toBe(true)
  })

  it('allows update work when the app is idle', () => {
    expect(shouldDeferUpdateWork()).toBe(false)
  })

  it('retries when a new release is visible before latest.yml finishes uploading', async () => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    vi.mocked(autoUpdater.checkForUpdates)
      .mockRejectedValueOnce(new Error('Cannot find latest.yml: HttpError: 404'))
      .mockResolvedValueOnce(null)
    const ready = vi.fn()
    setupAutoUpdater(null, ready)
    await vi.advanceTimersByTimeAsync(2000)
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1)
    expect(ready).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(10000)
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(2)
    const settled = vi.mocked(autoUpdater.on).mock.calls.find(([event]) => event === 'update-not-available')?.[1]
    expect(settled).toBeDefined()
    ;(settled as () => void)()
    expect(ready).toHaveBeenCalledTimes(1)
    expect(getUpdateState().phase).toBe('idle')
  })
})
