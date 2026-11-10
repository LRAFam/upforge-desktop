import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron-updater', () => ({
  autoUpdater: {
    logger: null,
    autoDownload: true,
    autoInstallOnAppQuit: true,
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    on: vi.fn(),
    quitAndInstall: vi.fn(),
  },
}))

vi.mock('electron', () => ({
  app: { isPackaged: true },
  BrowserWindow: { getAllWindows: () => [] },
}))

vi.mock('./app-notifications', () => ({ showAppNotification: vi.fn() }))

import { autoUpdater } from 'electron-updater'
import {
  checkForUpdatesIfIdle,
  getUpdateState,
  installUpdate,
  setInstallGate,
  setUpdateActivityGuard,
  setupAutoUpdater,
  shouldDeferUpdateWork,
} from './updater'

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

describe('installUpdate gate (quit guard)', () => {
  beforeEach(() => { vi.mocked(autoUpdater.quitAndInstall).mockClear(); setInstallGate(null) })

  it('does not start the installer until the gate lets it through', () => {
    let proceed: (() => void) | null = null
    setInstallGate((go) => { proceed = go })
    installUpdate()
    expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled()
    proceed!()
    expect(autoUpdater.quitAndInstall).toHaveBeenCalledTimes(1)
  })

  it('a cancelled gate never installs', () => {
    setInstallGate(() => { /* user pressed Cancel */ })
    installUpdate()
    expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled()
  })

  it('installs straight away without a gate', () => {
    installUpdate()
    expect(autoUpdater.quitAndInstall).toHaveBeenCalledTimes(1)
  })
})

describe('downloaded update stays ready', () => {
  it('skips later background checks so an offline check cannot drop "Restart now"', () => {
    vi.useFakeTimers()
    setUpdateActivityGuard(() => false)
    setupAutoUpdater(null, () => {})
    const handler = vi.mocked(autoUpdater.on).mock.calls.find(([event]) => event === 'update-downloaded')?.[1] as
      ((info: { version: string }) => void) | undefined
    handler?.({ version: '9.9.9' })
    expect(getUpdateState().phase).toBe('ready')
    vi.mocked(autoUpdater.checkForUpdates).mockClear()

    checkForUpdatesIfIdle()

    expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled()
    expect(getUpdateState().phase).toBe('ready')
    vi.clearAllTimers()
    vi.useRealTimers()
  })
})
