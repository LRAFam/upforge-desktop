import { APP_VERSION } from './app-version'
import { ERROR_REPORTING_KEY } from './error-reporting-key'
/**
 * trainer-bridge.ts
 * Electron main-process module that manages the Godot training process.
 * - Picks a free localhost port and spawns the Godot trainer with `-- --upforge-port=<N>`
 * - Connects to its TCP socket (IPC)
 * - Sends drill config, receives session results and lifecycle events
 * - Forwards results to the renderer via IPC, plus exactly one `trainer:session-ended` per launch
 */

import { spawn as nodeSpawn, ChildProcess } from 'child_process'
import { app, BrowserWindow } from 'electron'
import net from 'net'
import path from 'path'
import fs from 'fs'
import log from 'electron-log'
import type { AuthManager } from './auth-manager'

/** Legacy fixed port (trainer builds before the per-launch port). Not used for new launches. */
export const LEGACY_TRAINER_PORT = 7891
const TRAINER_HOST = '127.0.0.1'
const CONNECT_RETRY_MS = 300
/** ~20s: a cold Godot start or a Windows Defender scan can take well over 6s. */
const CONNECT_TIMEOUT_MS = 20_000

export type TrainerScenario =
  | 'flick' | 'tracking' | 'microadjust' | 'switching' | 'duel'
  | 'gridshot' | 'sixshot' | 'microflick' | 'strafe_track' | 'strafe_aim' | 'head_height' | 'angle_clearing' | 'distance_switching'
  | 'hold_angle' | 'jiggle_peek' | 'trade_window' | 'clear_site'
  | 'flash_swing' | 'operator_hold' | 'defuse_decision' | 'retake_crossfire'

export interface DrillConfig {
  scenario: TrainerScenario
  duration_seconds: number
  difficulty: 'easy' | 'medium' | 'hard' | 'pro'
  target_size_override?: number
  /** Assigned/user drill this run counts towards (never set for free play). Sent to the API in metadata. */
  user_drill_id?: number
  context?: {
    weakness?: string
    score?: number
    user_rank?: string
  }
  mouse_settings?: {
    dpi: number
    game: string
    sensitivity: number
    fov: number
    movement_speed?: number
    trainer_volume?: number
    /** In-game Scoped Sensitivity Multiplier (Operator Hold). */
    scoped_multiplier?: number
  }
  crosshair_settings?: {
    color: [number, number, number]
    shadow_show: boolean
    dot_show: boolean
    dot_radius: number
    dot_opacity: number
    inner_show: boolean
    inner_thickness: number
    inner_length: number
    inner_offset: number
    inner_opacity: number
    outer_show: boolean
    outer_thickness: number
    outer_length: number
    outer_offset: number
    outer_opacity: number
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
  max_streak?: number
  min_reaction_ms?: number
  max_reaction_ms?: number
  metadata?: Record<string, unknown>
  targets_per_minute?: number
}

/** What the renderer needs to replay / attribute a run (no mouse or crosshair settings). */
export interface TrainerLaunchInfo {
  launchId: number
  scenario: string
  duration_seconds: number
  difficulty: DrillConfig['difficulty']
  user_drill_id?: number
  context?: DrillConfig['context']
}

export type TrainerEndReason =
  | 'completed' | 'user_exit' | 'unknown_scenario' | 'invalid_config' | 'error' | 'crashed' | 'launch_failed'

export interface TrainerSessionEnded {
  launchId: number
  reason: TrainerEndReason
  scenario: string | null
  message?: string
  exitCode?: number | null
}

const ABORT_REASONS = new Set(['user_exit', 'unknown_scenario', 'invalid_config', 'error'])

/** Parse one line from Godot: lifecycle event, session result, or garbage. */
export function parseTrainerLine(line: string):
  | { kind: 'event'; event: string; reason: string; scenario: string | null; message?: string }
  | { kind: 'result'; result: SessionResult }
  | null {
  let parsed: unknown
  try { parsed = JSON.parse(line) } catch { return null }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const obj = parsed as Record<string, unknown>
  if ('event' in obj) {
    return {
      kind: 'event',
      event: String(obj.event),
      reason: typeof obj.reason === 'string' ? obj.reason : 'error',
      scenario: typeof obj.scenario === 'string' ? obj.scenario : null,
      ...(typeof obj.message === 'string' ? { message: obj.message } : {}),
    }
  }
  return { kind: 'result', result: obj as unknown as SessionResult }
}

/** Ask the OS for a free localhost port. */
export function getFreePort(host = TRAINER_HOST): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.unref()
    srv.once('error', reject)
    srv.listen(0, host, () => {
      const addr = srv.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      srv.close(() => (port ? resolve(port) : reject(new Error('Could not pick a free port'))))
    })
  })
}

interface LaunchState {
  id: number
  config: DrillConfig
  info: TrainerLaunchInfo
  port: number
  proc: ChildProcess | null
  socket: net.Socket | null
  ended: boolean
  connected: boolean
  /** Set when the pre-connect phase must stop (spawn error, early exit, superseded). */
  connectAbort: ((err: Error) => void) | null
}

export interface TrainerBridgeOptions {
  spawn?: typeof nodeSpawn
  resolveSpawnArgs?: () => { cmd: string; args: string[] }
  getPort?: () => Promise<number>
  connectTimeoutMs?: number
  connectRetryMs?: number
}

export class TrainerBridge {
  private _launch: LaunchState | null = null
  private _generation = 0
  private _buffer: string = ''
  private _mainWindow: (() => BrowserWindow | null)
  private _authManager: AuthManager | null = null
  private _opts: TrainerBridgeOptions
  private _lastLaunch: TrainerLaunchInfo | null = null

  private _onResultCallback?: (result: SessionResult, launch: TrainerLaunchInfo | null) => void
  private _onEndedCallback?: (ended: TrainerSessionEnded) => void

  constructor(getMainWindow: () => BrowserWindow | null, authManager?: AuthManager, opts: TrainerBridgeOptions = {}) {
    this._mainWindow = getMainWindow
    this._authManager = authManager ?? null
    this._opts = opts
  }

  setResultCallback(cb: (result: SessionResult, launch: TrainerLaunchInfo | null) => void): void {
    this._onResultCallback = cb
  }

  setEndedCallback(cb: (ended: TrainerSessionEnded) => void): void {
    this._onEndedCallback = cb
  }

  setAuthManager(authManager: AuthManager): void {
    this._authManager = authManager
  }

  /** Last launched drill (kept after it ends so a result view can replay it). */
  get lastLaunch(): TrainerLaunchInfo | null {
    return this._lastLaunch
  }

  /** Resolve path to the bundled Godot trainer binary */
  private _trainerPath(): string {
    const base = app.isPackaged
      ? path.join(process.resourcesPath, 'trainer')
      : path.join(app.getAppPath(), 'resources', 'trainer')

    if (process.platform === 'win32') return path.join(base, 'upforge-trainer.exe')
    if (process.platform === 'darwin') return path.join(base, 'UpForge Trainer.app', 'Contents', 'MacOS', 'UpForge Trainer')
    return path.join(base, 'upforge-trainer')
  }

  /**
   * Resolve the binary to spawn. On production the bundled binary is used.
   * In dev on Mac, falls back to running the Godot project via the editor CLI.
   * On Windows dev, the bundled .exe must exist — it's gitignored so devs need
   * to either export it from Godot or build the installer.
   */
  private _resolveSpawnArgs(): { cmd: string; args: string[] } {
    if (this._opts.resolveSpawnArgs) return this._opts.resolveSpawnArgs()
    const trainerPath = this._trainerPath()

    if (fs.existsSync(trainerPath)) {
      log.info('[TrainerBridge] Using bundled binary:', trainerPath)
      return { cmd: trainerPath, args: [] }
    }

    if (process.platform === 'win32') {
      throw new Error(
        `UpForge Trainer binary not found at: ${trainerPath}\n\n` +
        'To fix: export the Godot project (upforge-trainer) for Windows ' +
        'and place upforge-trainer.exe in resources/trainer/, ' +
        'or install the full UpForge release which bundles it automatically.'
      )
    }

    // Mac/Linux dev fallback: run the Godot project directly via editor CLI.
    // Check absolute paths — Electron's main process doesn't inherit shell PATH.
    const godotCandidates = [
      '/Applications/Godot.app/Contents/MacOS/Godot',
      '/opt/homebrew/bin/godot',
      '/usr/local/bin/godot',
    ]
    const godotBin = godotCandidates.find(c => {
      try { return fs.existsSync(c) } catch { return false }
    })

    if (!godotBin) {
      throw new Error('Godot engine not found. Install from godotengine.org or: brew install godot')
    }

    const projectDir = path.resolve(app.getAppPath(), '..', 'upforge-trainer')
    log.warn('[TrainerBridge] No binary — running project via Godot editor (dev):', projectDir)
    return { cmd: godotBin, args: ['--path', projectDir] }
  }

  /**
   * Launch a drill: kills any previous trainer, spawns a fresh one on its own port and sends the config.
   * Resolves once the config is sent; rejects (after killing the process) when it cannot connect.
   * Every launch ends with exactly one `trainer:session-ended`.
   */
  async launch(config: DrillConfig): Promise<void> {
    // Always kill any lingering process before spawning a fresh one (a previous drill may be in its
    // post-completion quit delay, and a new config sent to a dying process would end mid-countdown).
    if (this._launch) {
      log.info('[TrainerBridge] Killing previous trainer before new drill')
      this.kill('user_exit')
    }

    const id = ++this._generation
    const info: TrainerLaunchInfo = {
      launchId: id,
      scenario: config.scenario,
      duration_seconds: config.duration_seconds,
      difficulty: config.difficulty,
      ...(config.user_drill_id ? { user_drill_id: config.user_drill_id } : {}),
      ...(config.context ? { context: config.context } : {}),
    }
    const state: LaunchState = {
      id, config, info, port: 0, proc: null, socket: null, ended: false, connected: false, connectAbort: null,
    }
    this._launch = state
    this._lastLaunch = info
    this._buffer = ''

    try {
      const { cmd, args } = this._resolveSpawnArgs()
      state.port = await (this._opts.getPort ?? getFreePort)()
      if (this._launch !== state) throw new Error('Trainer launch was replaced by a newer one')
      const fullArgs = [...args, '--', `--upforge-port=${state.port}`]
      log.info('[TrainerBridge] Spawning trainer:', cmd, fullArgs)
      const proc = (this._opts.spawn ?? nodeSpawn)(cmd, fullArgs, { detached: false })
      state.proc = proc

      proc.on('error', (err) => {
        log.error('[TrainerBridge] Trainer process error:', err.message)
        if (state.connectAbort) state.connectAbort(err)
        else this._end(state, { reason: 'launch_failed', message: err.message })
      })
      proc.on('exit', (code) => {
        log.info('[TrainerBridge] Trainer exited with code:', code)
        state.proc = null
        if (!state.connected && state.connectAbort) {
          state.connectAbort(new Error(exitCodeMessage(code)))
        } else {
          this._end(state, { reason: 'crashed', exitCode: code, message: exitCodeMessage(code) })
        }
        if (this._launch === state) {
          state.socket?.destroy()
          this._launch = null
        }
      })
      proc.stderr?.on('data', (d) => log.warn('[Godot]', d.toString()))

      await this._connect(state)
    } catch (err) {
      const message = (err as Error)?.message ?? 'Failed to launch trainer'
      this._end(state, { reason: 'launch_failed', message })
      this._teardown(state)
      throw err instanceof Error ? err : new Error(message)
    }
  }

  private _connect(state: LaunchState): Promise<void> {
    const timeoutMs = this._opts.connectTimeoutMs ?? CONNECT_TIMEOUT_MS
    const retryMs = this._opts.connectRetryMs ?? CONNECT_RETRY_MS
    const deadline = Date.now() + timeoutMs
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | null = null
      let settled = false
      const fail = (err: Error) => {
        if (settled) return
        settled = true
        state.connectAbort = null
        if (timer) clearTimeout(timer)
        reject(err)
      }
      state.connectAbort = fail

      const tryConnect = () => {
        if (settled) return
        if (this._launch !== state || state.ended) {
          fail(new Error('Trainer launch was replaced by a newer one'))
          return
        }
        const socket = new net.Socket()
        const onConnectError = () => {
          socket.destroy()
          if (settled) return
          if (Date.now() >= deadline) {
            fail(new Error('Could not connect to the aim trainer. It may be blocked by antivirus — try again.'))
          } else {
            timer = setTimeout(tryConnect, retryMs)
          }
        }
        socket.once('error', onConnectError)
        socket.connect(state.port, TRAINER_HOST, () => {
          socket.removeListener('error', onConnectError)
          if (settled || this._launch !== state || state.ended) {
            socket.destroy()
            fail(new Error('Trainer launch was replaced by a newer one'))
            return
          }
          settled = true
          state.connectAbort = null
          state.connected = true
          state.socket = socket
          log.info('[TrainerBridge] Connected to Godot IPC socket on port', state.port)

          socket.on('data', (data) => {
            if (this._launch === state) this._onData(state, data.toString())
          })
          socket.on('close', () => {
            log.info('[TrainerBridge] Godot socket closed')
            if (state.socket === socket) state.socket = null
          })
          socket.on('error', (err) => log.warn('[TrainerBridge] Socket error:', err.message))

          this._sendConfig(socket, state.config)
          resolve()
        })
      }
      tryConnect()
    })
  }

  private _sendConfig(socket: net.Socket, config: DrillConfig): void {
    if (socket.destroyed) return
    // Inject user context and error reporting key so Godot can report errors
    const user = this._authManager?.getUser() ?? null
    const enriched = {
      ...config,
      _upforge_meta: {
        user_id: user?.id ?? null,
        user_email: user?.email ?? null,
        user_name: user?.name ?? null,
        app_version: APP_VERSION,
        error_key: ERROR_REPORTING_KEY,
      },
    }
    socket.write(JSON.stringify(enriched) + '\n', 'utf8')
    log.info('[TrainerBridge] Sent drill config:', config.scenario)
  }

  private _onData(state: LaunchState, chunk: string): void {
    this._buffer += chunk
    const lines = this._buffer.split('\n')
    this._buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const msg = parseTrainerLine(trimmed)
      if (!msg) {
        log.warn('[TrainerBridge] Bad JSON from Godot:', trimmed)
        continue
      }
      if (msg.kind === 'event') {
        log.info('[TrainerBridge] Trainer event:', msg.event, msg.reason)
        if (msg.event === 'aborted') {
          const reason = (ABORT_REASONS.has(msg.reason) ? msg.reason : 'error') as TrainerEndReason
          this._end(state, { reason, scenario: msg.scenario, message: msg.message })
        }
        continue
      }
      if (state.ended) continue // never forward a result after the launch already ended
      const result = msg.result
      log.info('[TrainerBridge] Received result, score:', result.score)
      this._mainWindow()?.webContents.send('trainer:session-result', result, state.info)
      this._onResultCallback?.(result, state.info)
      this._end(state, { reason: 'completed' })
    }
  }

  /** Emit `trainer:session-ended` once per launch. */
  private _end(state: LaunchState, ended: Omit<TrainerSessionEnded, 'launchId' | 'scenario'> & { scenario?: string | null }): void {
    if (state.ended) return
    state.ended = true
    const payload: TrainerSessionEnded = {
      launchId: state.id,
      reason: ended.reason,
      scenario: ended.scenario ?? state.config.scenario,
      ...(ended.message ? { message: ended.message } : {}),
      ...(ended.exitCode !== undefined ? { exitCode: ended.exitCode } : {}),
    }
    log.info('[TrainerBridge] Session ended:', payload.reason, payload.scenario)
    try { this._mainWindow()?.webContents.send('trainer:session-ended', payload) } catch { /* window gone */ }
    this._onEndedCallback?.(payload)
  }

  private _teardown(state: LaunchState): void {
    state.connectAbort?.(new Error('Trainer stopped'))
    state.socket?.destroy()
    state.socket = null
    try { state.proc?.kill() } catch { /* already gone */ }
    if (this._launch === state) this._launch = null
  }

  /** Kill the trainer process. A launch that had not finished ends with `reason` (default user_exit). */
  kill(reason: TrainerEndReason = 'user_exit'): void {
    const state = this._launch
    if (!state) return
    this._end(state, { reason })
    this._teardown(state)
  }
}

function exitCodeMessage(code: number | null): string {
  if (code === 2) return 'The aim trainer could not open its connection port. Try again.'
  if (code === 3) return 'The aim trainer closed because UpForge did not connect in time. Try again.'
  if (code === 0) return 'The aim trainer closed before the drill finished.'
  return 'The aim trainer closed unexpectedly.'
}
