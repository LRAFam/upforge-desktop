import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '/tmp', requestSingleInstanceLock: () => false } }))
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn() } }))

import { isUpForgeImage, resolveInstanceLock, type InstanceLockDeps } from './instance-coordinator'

const NOW = 1_000_000
const OTHER_PID = 4242

function makeDeps(opts: { heartbeatAgeMs: number; image: string | null; focused?: boolean; lockAfter?: boolean }) {
  let lockCalls = 0
  const deps = {
    requestLock: vi.fn(() => {
      lockCalls += 1
      return lockCalls > 1 ? (opts.lockAfter ?? true) : false
    }),
    readLockState: vi.fn(() => ({ pid: OTHER_PID, port: 50000, heartbeat: NOW - opts.heartbeatAgeMs })),
    clearLockState: vi.fn(),
    now: () => NOW,
    isProcessAlive: vi.fn(() => true),
    sendFocusRequest: vi.fn(async () => opts.focused ?? false),
    getProcessImageName: vi.fn(async () => opts.image),
    killProcess: vi.fn(),
    sleep: vi.fn(async () => {}),
    ownExecPath: 'C:\\Program Files\\UpForge\\UpForge.exe',
  } satisfies InstanceLockDeps
  return deps
}

describe('resolveInstanceLock', () => {
  it('fresh heartbeat + slow focus → duplicate, never kills', async () => {
    const deps = makeDeps({ heartbeatAgeMs: 5_000, image: 'UpForge.exe', focused: false })
    await expect(resolveInstanceLock(deps)).resolves.toBe('duplicate')
    expect(deps.sendFocusRequest).toHaveBeenCalledWith(50000)
    expect(deps.killProcess).not.toHaveBeenCalled()
    expect(deps.clearLockState).not.toHaveBeenCalled()
  })

  it('fresh heartbeat + focus OK → duplicate', async () => {
    const deps = makeDeps({ heartbeatAgeMs: 5_000, image: 'UpForge.exe', focused: true })
    await expect(resolveInstanceLock(deps)).resolves.toBe('duplicate')
    expect(deps.killProcess).not.toHaveBeenCalled()
  })

  it('stale heartbeat + UpForge image → kills and takes over', async () => {
    const deps = makeDeps({ heartbeatAgeMs: 120_000, image: 'UpForge.exe' })
    await expect(resolveInstanceLock(deps)).resolves.toBe('primary')
    expect(deps.sendFocusRequest).not.toHaveBeenCalled()
    expect(deps.getProcessImageName).toHaveBeenCalledWith(OTHER_PID)
    expect(deps.killProcess).toHaveBeenCalledWith(OTHER_PID)
    expect(deps.clearLockState).toHaveBeenCalled()
  })

  it('stale heartbeat + other image (PID reused) → does not kill', async () => {
    const deps = makeDeps({ heartbeatAgeMs: 120_000, image: 'chrome.exe' })
    await resolveInstanceLock(deps)
    expect(deps.killProcess).not.toHaveBeenCalled()
    expect(deps.clearLockState).toHaveBeenCalled()
  })

  it('stale heartbeat + unknown image → does not kill', async () => {
    const deps = makeDeps({ heartbeatAgeMs: 120_000, image: null })
    await resolveInstanceLock(deps)
    expect(deps.killProcess).not.toHaveBeenCalled()
  })
})

describe('isUpForgeImage', () => {
  it('matches UpForge executables case-insensitively', () => {
    expect(isUpForgeImage('UpForge.exe', '/x/electron')).toBe(true)
    expect(isUpForgeImage('upforge', '/x/electron')).toBe(true)
    expect(isUpForgeImage('/Applications/UpForge.app/Contents/MacOS/UpForge', '/x/electron')).toBe(true)
  })
  it('matches own executable (dev electron) and rejects others', () => {
    expect(isUpForgeImage('electron.exe', 'C:\\dev\\node_modules\\electron\\dist\\electron.exe')).toBe(true)
    expect(isUpForgeImage('chrome.exe', 'C:\\Program Files\\UpForge\\UpForge.exe')).toBe(false)
    expect(isUpForgeImage('UpForgeHelper.exe', 'C:\\Program Files\\UpForge\\UpForge.exe')).toBe(false)
    expect(isUpForgeImage(null)).toBe(false)
  })
})
