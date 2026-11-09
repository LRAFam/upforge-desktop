/**
 * Single-instance lock with stale-process recovery.
 * Duplicate launches send FOCUS to the running instance; only stale UpForge processes are replaced.
 */

import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import net from 'net'
import log from 'electron-log'

const STALE_MS = 45_000
const FOCUS_TIMEOUT_MS = 2_500

export interface LockState {
  pid: number
  port: number
  heartbeat: number
}

function lockFilePath(): string {
  return path.join(app.getPath('userData'), 'instance-lock.json')
}

function readLockState(): LockState | null {
  try {
    const raw = fs.readFileSync(lockFilePath(), 'utf-8')
    return JSON.parse(raw) as LockState
  } catch {
    return null
  }
}

function writeLockState(state: LockState): void {
  try {
    fs.mkdirSync(path.dirname(lockFilePath()), { recursive: true })
    fs.writeFileSync(lockFilePath(), JSON.stringify(state))
  } catch (err) {
    log.warn('[InstanceLock] Failed to write lock file:', err)
  }
}

function clearLockState(): void {
  try {
    fs.unlinkSync(lockFilePath())
  } catch { /* ignore */ }
}

function isProcessAlive(pid: number): boolean {
  if (pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function killProcess(pid: number): void {
  if (pid === process.pid) return
  try {
    if (process.platform === 'win32') {
      const { execSync } = require('child_process') as typeof import('child_process')
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore', windowsHide: true })
    } else {
      process.kill(pid, 'SIGTERM')
    }
    log.warn(`[InstanceLock] Terminated stale UpForge process ${pid}`)
  } catch (err) {
    log.warn(`[InstanceLock] Could not terminate pid ${pid}:`, err)
  }
}

/** Executable image name for a PID (e.g. "UpForge.exe"), or null if unknown. */
function getProcessImageName(pid: number): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const { execFile } = require('child_process') as typeof import('child_process')
      const done = (err: Error | null, stdout: string) => {
        if (err) return resolve(null)
        const out = String(stdout).trim()
        if (!out) return resolve(null)
        if (process.platform === 'win32') {
          // CSV: "UpForge.exe","1234","Console","1","123,456 K"
          const m = out.match(/^"([^"]+)"/)
          return resolve(m ? m[1] : null)
        }
        resolve(path.basename(out.split('\n')[0].trim()))
      }
      if (process.platform === 'win32') {
        execFile('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { windowsHide: true, timeout: 3_000 }, done)
      } else {
        execFile('ps', ['-p', String(pid), '-o', 'comm='], { timeout: 3_000 }, done)
      }
    } catch {
      resolve(null)
    }
  })
}

function normaliseImage(name: string): string {
  return path.basename(name.replace(/\\/g, '/')).toLowerCase().replace(/\.exe$/, '')
}

/** True when the image name is UpForge (or this same executable, e.g. electron in dev). */
export function isUpForgeImage(imageName: string | null, ownExecPath: string = process.execPath): boolean {
  if (!imageName) return false
  const image = normaliseImage(imageName)
  if (!image) return false
  return image === 'upforge' || image === normaliseImage(ownExecPath)
}

function sendFocusRequest(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host: '127.0.0.1' }, () => {
      socket.write('FOCUS\n')
    })

    let settled = false
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(ok)
    }

    socket.setTimeout(FOCUS_TIMEOUT_MS, () => finish(false))
    socket.on('data', (chunk) => {
      if (chunk.toString().includes('OK')) finish(true)
    })
    socket.on('error', () => finish(false))
    socket.on('end', () => finish(false))
  })
}

export type InstanceRole = 'primary' | 'duplicate'

/** Side effects used by resolveInstanceLock — injectable for tests. */
export interface InstanceLockDeps {
  requestLock: () => boolean
  readLockState: () => LockState | null
  clearLockState: () => void
  now: () => number
  isProcessAlive: (pid: number) => boolean
  sendFocusRequest: (port: number) => Promise<boolean>
  getProcessImageName: (pid: number) => Promise<string | null>
  killProcess: (pid: number) => void
  sleep: (ms: number) => Promise<void>
  ownExecPath: string
}

function defaultDeps(): InstanceLockDeps {
  return {
    requestLock: () => app.requestSingleInstanceLock(),
    readLockState,
    clearLockState,
    now: () => Date.now(),
    isProcessAlive,
    sendFocusRequest,
    getProcessImageName,
    killProcess,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    ownExecPath: process.execPath,
  }
}

/**
 * Acquire lock, focus an existing instance, or replace a stale one.
 *
 * Only kills the previous process when its heartbeat is stale AND its PID still
 * belongs to an UpForge executable. A live instance with a fresh heartbeat that
 * is slow to answer FOCUS (busy recording/uploading) is never killed.
 */
export async function resolveInstanceLock(overrides: Partial<InstanceLockDeps> = {}): Promise<InstanceRole> {
  const deps: InstanceLockDeps = { ...defaultDeps(), ...overrides }

  if (deps.requestLock()) {
    return 'primary'
  }

  const existing = deps.readLockState()
  const alive = !!existing?.pid && deps.isProcessAlive(existing.pid)
  const stale = !existing || deps.now() - existing.heartbeat > STALE_MS

  if (existing && alive && !stale) {
    const focused = await deps.sendFocusRequest(existing.port)
    if (focused) {
      log.info('[InstanceLock] Duplicate launch — focused existing window')
    } else {
      log.warn('[InstanceLock] Existing instance did not respond to focus but heartbeat is fresh — leaving it running')
    }
    return 'duplicate'
  }

  if (existing) {
    log.warn('[InstanceLock] Existing lock is stale or process exited — replacing instance')
  }

  if (existing && alive) {
    const image = await deps.getProcessImageName(existing.pid)
    if (isUpForgeImage(image, deps.ownExecPath)) {
      deps.killProcess(existing.pid)
      await deps.sleep(600)
    } else {
      log.warn(`[InstanceLock] Lock PID ${existing.pid} is not UpForge (${image ?? 'unknown'}) — not terminating`)
    }
  }
  deps.clearLockState()

  if (deps.requestLock()) {
    log.info('[InstanceLock] Acquired lock after stale takeover')
    return 'primary'
  }

  log.warn('[InstanceLock] Could not acquire lock after stale takeover')
  return 'duplicate'
}

export function startInstanceCoordinator(onFocus: () => void): () => void {
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  let server: net.Server | null = null

  server = net.createServer((socket) => {
    socket.on('data', (chunk) => {
      const cmd = chunk.toString().trim()
      if (cmd === 'FOCUS') {
        try {
          onFocus()
          socket.write('OK\n')
        } catch (err) {
          log.warn('[InstanceLock] Focus handler failed:', err)
          socket.write('ERR\n')
        }
      }
    })
  })

  server.listen(0, '127.0.0.1', () => {
    const addr = server!.address()
    if (!addr || typeof addr === 'string') return
    writeLockState({ pid: process.pid, port: addr.port, heartbeat: Date.now() })
    log.info(`[InstanceLock] Coordinator listening on 127.0.0.1:${addr.port}`)
  })

  heartbeatTimer = setInterval(() => {
    const state = readLockState()
    if (state && state.pid === process.pid) {
      writeLockState({ ...state, heartbeat: Date.now() })
    }
  }, 10_000)

  return () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer)
    server?.close()
    clearLockState()
  }
}
