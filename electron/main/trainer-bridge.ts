/**
 * trainer-bridge.ts
 * Electron main-process module that manages the Godot training process.
 * - Spawns/kills the Godot trainer binary
 * - Connects to its TCP socket (IPC)
 * - Sends drill config, receives session results
 * - Forwards results to the renderer via IPC
 */

import { spawn, ChildProcess } from 'child_process'
import { app, BrowserWindow } from 'electron'
import net from 'net'
import path from 'path'
import fs from 'fs'
import log from 'electron-log'

const TRAINER_PORT = 7891
const TRAINER_HOST = '127.0.0.1'
const CONNECT_RETRY_MS = 300
const CONNECT_MAX_ATTEMPTS = 20

export interface DrillConfig {
  scenario: 'flick' | 'tracking' | 'microadjust' | 'switching'
  duration_seconds: number
  difficulty: 'easy' | 'medium' | 'hard' | 'pro'
  target_size_override?: number
  context?: {
    weakness?: string
    score?: number
    user_rank?: string
  }
}

export interface SessionResult {
  scenario: string
  duration_seconds: number
  score: number
  accuracy_pct: number
  avg_reaction_ms: number
  consistency_score: number
  targets_hit: number
  targets_missed: number
  heatmap: Array<{ x: number; y: number; hit: boolean }>
  completed_at: string
}

export class TrainerBridge {
  private _process: ChildProcess | null = null
  private _socket: net.Socket | null = null
  private _buffer: string = ''
  private _mainWindow: (() => BrowserWindow | null)
  private _pendingConfig: DrillConfig | null = null

  constructor(getMainWindow: () => BrowserWindow | null) {
    this._mainWindow = getMainWindow
  }

  /** Resolve path to the bundled Godot trainer binary */
  private _trainerPath(): string {
    const isPackaged = app.isPackaged
    const base = isPackaged
      ? path.join(process.resourcesPath, 'trainer')
      : path.join(app.getAppPath(), 'resources', 'trainer')

    if (process.platform === 'win32') return path.join(base, 'upforge-trainer.exe')
    if (process.platform === 'darwin') return path.join(base, 'upforge-trainer.app', 'Contents', 'MacOS', 'upforge-trainer')
    return path.join(base, 'upforge-trainer')
  }

  /** Launch a drill. Spawns Godot if not running, then sends config. */
  async launch(config: DrillConfig): Promise<void> {
    this._pendingConfig = config

    if (!this._process || this._process.exitCode !== null) {
      await this._spawnGodot()
    }

    if (this._socket && !this._socket.destroyed) {
      this._sendConfig(config)
    }
    // If socket not yet connected, _pendingConfig will be sent once connected
  }

  private async _spawnGodot(): Promise<void> {
    const trainerPath = this._trainerPath()

    if (!fs.existsSync(trainerPath)) {
      log.error('[TrainerBridge] Trainer binary not found at:', trainerPath)
      throw new Error('UpForge Trainer binary not found. Please reinstall the app.')
    }

    log.info('[TrainerBridge] Spawning Godot trainer:', trainerPath)
    this._process = spawn(trainerPath, [], { detached: false })

    this._process.on('exit', (code) => {
      log.info('[TrainerBridge] Trainer exited with code:', code)
      this._process = null
      this._socket = null
    })

    this._process.stderr?.on('data', (d) => log.warn('[Godot]', d.toString()))

    // Wait for Godot to start its TCP server, then connect
    await this._connectWithRetry()
  }

  private _connectWithRetry(attempts = 0): Promise<void> {
    return new Promise((resolve, reject) => {
      const tryConnect = (attempt: number) => {
        const socket = new net.Socket()
        socket.connect(TRAINER_PORT, TRAINER_HOST, () => {
          log.info('[TrainerBridge] Connected to Godot IPC socket')
          this._socket = socket
          this._buffer = ''

          socket.on('data', (data) => this._onData(data.toString()))
          socket.on('close', () => {
            log.info('[TrainerBridge] Godot socket closed')
            this._socket = null
          })
          socket.on('error', (err) => log.warn('[TrainerBridge] Socket error:', err.message))

          // Send pending config if any
          if (this._pendingConfig) {
            this._sendConfig(this._pendingConfig)
            this._pendingConfig = null
          }
          resolve()
        })

        socket.on('error', () => {
          socket.destroy()
          if (attempt < CONNECT_MAX_ATTEMPTS) {
            setTimeout(() => tryConnect(attempt + 1), CONNECT_RETRY_MS)
          } else {
            reject(new Error('[TrainerBridge] Could not connect to Godot after max attempts'))
          }
        })
      }
      tryConnect(attempts)
    })
  }

  private _sendConfig(config: DrillConfig): void {
    if (!this._socket || this._socket.destroyed) return
    const payload = JSON.stringify(config) + '\n'
    this._socket.write(payload, 'utf8')
    log.info('[TrainerBridge] Sent drill config:', config.scenario)
  }

  private _onData(chunk: string): void {
    this._buffer += chunk
    const lines = this._buffer.split('\n')
    this._buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const result: SessionResult = JSON.parse(trimmed)
        log.info('[TrainerBridge] Received result, score:', result.score)
        this._mainWindow()?.webContents.send('trainer:session-result', result)
      } catch (e) {
        log.warn('[TrainerBridge] Bad JSON from Godot:', trimmed)
      }
    }
  }

  /** Kill the trainer process */
  kill(): void {
    this._socket?.destroy()
    this._process?.kill()
    this._socket = null
    this._process = null
  }
}
