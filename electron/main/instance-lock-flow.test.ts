import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

/**
 * Single-instance lock paths the unit tests in instance-coordinator.test.ts do not reach:
 * first launch, missing/dead lock owners, a failed takeover, and the real lock file + FOCUS
 * handshake between a running instance and a second launch.
 */

const runtime = vi.hoisted(() => ({ dir: '' }))
vi.mock('electron', () => ({ app: { getPath: () => runtime.dir, requestSingleInstanceLock: () => false } }))
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn() } }))

import { resolveInstanceLock, startInstanceCoordinator, type InstanceLockDeps, type LockState } from './instance-coordinator'

const NOW = 1_000_000

function deps(opts: { lock?: boolean[]; state?: LockState | null; alive?: boolean } = {}) {
  const answers = [...(opts.lock ?? [false, true])]
  return {
    requestLock: vi.fn(() => answers.shift() ?? false),
    readLockState: vi.fn(() => (opts.state === undefined ? { pid: 4242, port: 50000, heartbeat: NOW - 1_000 } : opts.state)),
    clearLockState: vi.fn(),
    now: () => NOW,
    isProcessAlive: vi.fn(() => opts.alive ?? true),
    sendFocusRequest: vi.fn(async () => true),
    getProcessImageName: vi.fn(async () => 'UpForge.exe'),
    killProcess: vi.fn(),
    sleep: vi.fn(async () => {}),
    ownExecPath: 'C:\\Program Files\\UpForge\\UpForge.exe',
  } satisfies InstanceLockDeps
}

describe('resolveInstanceLock — remaining paths', () => {
  it('first launch takes the lock without reading the lock file', async () => {
    const d = deps({ lock: [true] })
    await expect(resolveInstanceLock(d)).resolves.toBe('primary')
    expect(d.readLockState).not.toHaveBeenCalled()
    expect(d.killProcess).not.toHaveBeenCalled()
  })

  it('lock held but no lock file → clears and retries, kills nothing', async () => {
    const d = deps({ state: null })
    await expect(resolveInstanceLock(d)).resolves.toBe('primary')
    expect(d.sendFocusRequest).not.toHaveBeenCalled()
    expect(d.getProcessImageName).not.toHaveBeenCalled()
    expect(d.killProcess).not.toHaveBeenCalled()
    expect(d.clearLockState).toHaveBeenCalled()
  })

  it('owner process already exited (fresh heartbeat) → takes over without focus or kill', async () => {
    const d = deps({ alive: false })
    await expect(resolveInstanceLock(d)).resolves.toBe('primary')
    expect(d.sendFocusRequest).not.toHaveBeenCalled()
    expect(d.killProcess).not.toHaveBeenCalled()
  })

  it('takeover that still cannot get the lock stays a duplicate', async () => {
    const d = deps({ state: null, lock: [false, false] })
    await expect(resolveInstanceLock(d)).resolves.toBe('duplicate')
    expect(d.requestLock).toHaveBeenCalledTimes(2)
  })
})

describe('instance coordinator — lock file and FOCUS handshake', () => {
  let stop: (() => void) | null = null
  const lockFile = () => path.join(runtime.dir, 'instance-lock.json')

  beforeEach(() => { runtime.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upforge-instance-')) })
  afterEach(() => {
    stop?.()
    stop = null
    fs.rmSync(runtime.dir, { recursive: true, force: true })
  })

  async function waitForLockFile(): Promise<LockState> {
    for (let i = 0; i < 100; i++) {
      if (fs.existsSync(lockFile())) return JSON.parse(fs.readFileSync(lockFile(), 'utf8')) as LockState
      await new Promise(r => setTimeout(r, 10))
    }
    throw new Error('lock file never written')
  }

  it('a second launch reaches the running instance over FOCUS and stays a duplicate', async () => {
    const onFocus = vi.fn()
    stop = startInstanceCoordinator(onFocus)
    const state = await waitForLockFile()
    expect(state.pid).toBe(process.pid)
    expect(state.port).toBeGreaterThan(0)

    // Real lock file, real TCP focus request; only the OS lock and process checks are faked.
    const killProcess = vi.fn()
    const role = await resolveInstanceLock({
      requestLock: () => false,
      isProcessAlive: () => true,
      killProcess,
    })
    expect(role).toBe('duplicate')
    expect(onFocus).toHaveBeenCalledTimes(1)
    expect(killProcess).not.toHaveBeenCalled()
  })

  it('a running instance whose focus handler throws is still left alone', async () => {
    stop = startInstanceCoordinator(() => { throw new Error('window gone') })
    await waitForLockFile()
    const killProcess = vi.fn()
    await expect(resolveInstanceLock({ requestLock: () => false, isProcessAlive: () => true, killProcess })).resolves.toBe('duplicate')
    expect(killProcess).not.toHaveBeenCalled()
  })

  it('stopping the coordinator removes the lock file', async () => {
    const stopFn = startInstanceCoordinator(() => {})
    await waitForLockFile()
    stopFn()
    expect(fs.existsSync(lockFile())).toBe(false)
  })
})
