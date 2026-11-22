import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => void>(),
  check: vi.fn(), download: vi.fn(), install: vi.fn(), destroy: vi.fn(), send: vi.fn(),
}))
vi.mock('electron-updater', () => ({ autoUpdater: {
  on: (event: string, handler: (...args: unknown[]) => void) => mocks.handlers.set(event, handler),
  checkForUpdates: mocks.check,
  downloadUpdate: mocks.download,
  quitAndInstall: mocks.install,
} }))
vi.mock('electron', () => ({
  app: { isPackaged: true },
  BrowserWindow: { getAllWindows: () => [{ isDestroyed: () => false, destroy: mocks.destroy, webContents: { send: mocks.send } }] },
}))
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('./app-notifications', () => ({ showAppNotification: vi.fn() }))

beforeEach(() => {
  vi.useFakeTimers()
  vi.resetModules()
  vi.clearAllMocks()
  mocks.handlers.clear()
})
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })

describe('updater missing assets', () => {
  it('continues startup after exhausted metadata retries and permits a later successful check', async () => {
    const updater = await import('./updater')
    const error = new Error('Cannot find latest.yml: HTTP 404')
    mocks.check.mockImplementation(async () => {
      mocks.handlers.get('checking-for-update')?.()
      mocks.handlers.get('error')?.(error)
      throw error
    })
    // Mirror index.ts: opening the main app marks startup complete, including on timeout.
    const ready = vi.fn(() => updater.markStartupComplete())
    updater.setupAutoUpdater(null, ready)
    await vi.advanceTimersByTimeAsync(222_001)
    expect(mocks.check).toHaveBeenCalledTimes(8)
    expect(ready).toHaveBeenCalledTimes(1)
    expect(mocks.install).not.toHaveBeenCalled()
    expect(mocks.destroy).not.toHaveBeenCalled()
    expect(updater.getUpdateState().phase).toBe('error')

    mocks.check.mockImplementation(async () => {
      mocks.handlers.get('checking-for-update')?.()
      mocks.handlers.get('update-not-available')?.()
    })
    updater.checkForUpdatesIfIdle()
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.check).toHaveBeenCalledTimes(9)
    expect(updater.getUpdateState().phase).toBe('idle')
  })

  it('handles a missing installer without quitting or leaving startup blocked', async () => {
    const updater = await import('./updater')
    const error = new Error('Cannot download UpForge-Setup-9.9.9.exe, status 404')
    mocks.check.mockResolvedValue(null)
    mocks.download.mockRejectedValue(error)
    const ready = vi.fn()
    updater.setupAutoUpdater(null, ready)
    mocks.handlers.get('update-available')?.({ version: '9.9.9' })
    await vi.advanceTimersByTimeAsync(0)
    expect(ready).toHaveBeenCalledTimes(1)
    expect(updater.getUpdateState()).toEqual({ phase: 'error', error: error.message })
    expect(mocks.install).not.toHaveBeenCalled()
    expect(mocks.destroy).not.toHaveBeenCalled()
  })
})
