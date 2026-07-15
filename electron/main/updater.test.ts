import { beforeEach, describe, expect, it, vi } from 'vitest'

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

import { setUpdateActivityGuard, shouldDeferUpdateWork } from './updater'

describe('update activity guard', () => {
  beforeEach(() => setUpdateActivityGuard(() => false))

  it('defers update work while a game or recording is active', () => {
    setUpdateActivityGuard(() => true)
    expect(shouldDeferUpdateWork()).toBe(true)
  })

  it('allows update work when the app is idle', () => {
    expect(shouldDeferUpdateWork()).toBe(false)
  })
})
