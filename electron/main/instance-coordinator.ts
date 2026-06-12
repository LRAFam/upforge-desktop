/**
 * Single-instance lock with stale-process recovery.
 * Duplicate launches send FOCUS to the running instance; unresponsive instances are replaced.
 */

import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import net from 'net'
import log from 'electron-log'

const STALE_MS = 45_000
const FOCUS_TIMEOUT_MS = 2_500

interface LockState {
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

function isStale(state: LockState): boolean {
  return Date.now() - state.heartbeat > STALE_MS
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

/** Acquire lock, focus an existing instance, or replace a stale one. */
export async function resolveInstanceLock(): Promise<InstanceRole> {
  if (app.requestSingleInstanceLock()) {
    return 'primary'
  }

  const existing = readLockState()
  if (existing && !isStale(existing) && isProcessAlive(existing.pid)) {
    const focused = await sendFocusRequest(existing.port)
    if (focused) {
      log.info('[InstanceLock] Duplicate launch — focused existing window')
      return 'duplicate'
    }
    log.warn('[InstanceLock] Existing instance did not respond to focus — treating as stale')
  } else if (existing) {
    log.warn('[InstanceLock] Existing lock is stale or process exited — replacing instance')
  }

  if (existing?.pid && isProcessAlive(existing.pid)) {
    killProcess(existing.pid)
    await new Promise((r) => setTimeout(r, 600))
  }
  clearLockState()

  if (app.requestSingleInstanceLock()) {
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
