import { OBSWebSocket } from 'obs-websocket-js'
import { app } from 'electron'
import { existsSync, statSync } from 'fs'
import { join } from 'path'
import https from 'https'
import log from 'electron-log'
import {
  CRITICAL_FREE_DISK_BYTES,
  WARN_FREE_DISK_BYTES,
  getFreeDiskSpace,
} from './disk-space'
import { setupUpForgeScene, retargetUpForgeCapture, fitUpForgeCaptureToCanvas, type ObsSetupResult, type ObsSceneSwitchOptions } from './obs-setup'
import { findObsWindowString } from './game-window-finder'
import { formatObsConnectError, obsConnectHosts } from './obs-connect'
import { applyObsRecordingSettings, type ObsApplyResult } from './obs-output-settings'
import type { RecorderConfig } from './recorder'

export interface OBSSettings {
  host: string
  port: number
  password: string
  replayBufferSeconds: number
  /** When true, do not switch OBS to the UpForge scene on connect/record (for custom stream layouts). */
  obsPreserveActiveScene: boolean
}

export interface OBSStatus {
  connected: boolean
  recording: boolean
  replayBufferActive: boolean
  outputPath: string | null
  lastError: string | null
  obsVersion: string | null
}

interface LiveKillEvent {
  EventID: number
  EventName: string
  EventTime: number
  KillerName?: string
  VictimName?: string
  Assistants?: string[]
}

/**
 * OBSRecorder — match recording via OBS WebSocket (obs-websocket v5, OBS 28+).
 *
 * Provides two complementary recording modes running simultaneously:
 *   1. Full match VOD: StartRecord on game start, StopRecord on game end.
 *      Output is a native H.264/NVENC MP4 — no transcoding needed for clip extraction.
 *   2. Replay buffer: A rolling N-second buffer. SaveReplayBuffer is triggered
 *      automatically on each player kill detected via the Riot Live Client API,
 *      giving near-instant clips during the match.
 *
 * Public interface is intentionally compatible with DesktopRecorder so index.ts
 * can use either without branching. OBS-specific extras (saveReplayClip,
 * connectOBS, getOBSStatus) are additive.
 */
export class OBSRecorder {
  private _obs = new OBSWebSocket()
  private _connected = false
  private _recording = false
  private _replayBufferActive = false
  private _startedAt: number | null = null
  private _outputPath: string | null = null
  private _lastError: string | null = null
  private _obsVersion: string | null = null
  private _noAudio = false
  private _startupWarning: string | null = null

  // Live kill polling state
  private _liveKillPollTimer: ReturnType<typeof setInterval> | null = null
  private _seenKillIds = new Set<number>()
  private _localPlayerName: string | null = null

  // Replay clip save — resolves when ReplayBufferSaved fires
  private _pendingReplaySave: ((path: string) => void) | null = null
  // Guard: only one SaveReplayBuffer in-flight at a time — prevents _pendingReplaySave clobber
  private _savingReplay = false

  private _disconnectedDuringRecording = false
  private _clipsOnlySession = false
  private _lastConnectWarnAt = 0
  /** Last game OBS capture was pointed at — used to force refresh on game switches. */
  private _lastCaptureGame: string | null = null

  onStatusChange?: (recording: boolean, error?: string) => void
  onReplayClipSaved?: (path: string, trigger: string) => void
  /** Fired when connection state changes. `error` is set only for unexpected disconnects. */
  onConnectionChange?: (connected: boolean, error?: string | null) => void

  /** Suppress ConnectionClosed while we intentionally tear down before reconnecting. */
  private _suppressConnectionEvents = false
  private _connectInFlight: Promise<{ ok: boolean; error?: string; version?: string; setup?: ObsSetupResult }> | null = null

  constructor(
    private getSettings: () => OBSSettings,
    private getRecordingConfig?: () => RecorderConfig | undefined,
    private getPrimaryGame?: () => string,
  ) {
    this._obs.on('ReplayBufferSaved', ({ savedReplayPath }) => {
      log.info('[OBSRecorder] Replay buffer saved:', savedReplayPath)
      if (this._pendingReplaySave) {
        const resolve = this._pendingReplaySave
        this._pendingReplaySave = null
        resolve(savedReplayPath)
      }
      this.onReplayClipSaved?.(savedReplayPath, 'replay-buffer')
    })

    this._obs.on('RecordStateChanged', ({ outputActive, outputPath }) => {
      this._recording = outputActive
      if (outputPath) this._outputPath = outputPath
      if (!outputActive) {
        this._startedAt = null
        this.onStatusChange?.(false)
        this._stopLiveKillPoll()
      }
    })

    this._obs.on('ReplayBufferStateChanged', ({ outputActive }) => {
      this._replayBufferActive = outputActive
    })

    this._obs.on('ConnectionClosed', () => {
      if (this._suppressConnectionEvents) return
      log.warn('[OBSRecorder] OBS disconnected')
      const wasConnected = this._connected
      this._connected = false
      if (this._recording || this._startedAt) {
        this._disconnectedDuringRecording = true
        // Keep _startedAt — OBS often keeps recording locally after WebSocket drops.
        if (this._recording) {
          this._recording = false
          this._stopLiveKillPoll()
          this.onStatusChange?.(false, 'OBS disconnected during recording')
        }
      }
      if (wasConnected) {
        this.onConnectionChange?.(false, 'OBS disconnected')
      }
    })
  }

  // ── Connection ──────────────────────────────────────────────────────────────

  async connect(): Promise<{ ok: boolean; error?: string; version?: string; setup?: ObsSetupResult }> {
    if (this._connected) {
      return { ok: true, version: this._obsVersion ?? undefined }
    }
    if (this._connectInFlight) return this._connectInFlight

    this._connectInFlight = this._connectOnce()
    try {
      return await this._connectInFlight
    } finally {
      this._connectInFlight = null
    }
  }

  private async _connectOnce(): Promise<{ ok: boolean; error?: string; version?: string; setup?: ObsSetupResult }> {
    const { host, port, password, replayBufferSeconds } = this.getSettings()
    const hosts = obsConnectHosts(host)
    let lastRawError = 'OBS not reachable'

    // Clear stale socket state from a prior failed attempt (do not treat as user-visible disconnect).
    this._suppressConnectionEvents = true
    try {
      await this._obs.disconnect()
    } catch { /* not connected */ }
    this._suppressConnectionEvents = false
    this._connected = false

    for (const tryHost of hosts) {
      const url = `ws://${tryHost}:${port}`
      try {
        log.info('[OBSRecorder] Connecting to', url)
        const { obsWebSocketVersion } = await this._obs.connect(
          url,
          password || undefined,
          { rpcVersion: 1 },
        )
        this._connected = true
        this._obsVersion = obsWebSocketVersion
        this._lastError = null
        log.info('[OBSRecorder] Connected to OBS WebSocket', obsWebSocketVersion, 'via', tryHost)

        if (replayBufferSeconds > 0) {
          this._obs.call('SetProfileParameter', {
            parameterCategory: 'SimpleOutput',
            parameterName: 'ReplayBufferDuration',
            parameterValue: String(replayBufferSeconds),
          }).catch((err) => {
            log.warn('[OBSRecorder] Could not set ReplayBufferDuration (non-fatal):', err)
          })
        }

        const setup = await setupUpForgeScene(this._obs, this.getPrimaryGame?.() ?? 'valorant', {
          switchScene: !this.getSettings().obsPreserveActiveScene,
        })
        if (!setup.ok) {
          log.warn('[OBSRecorder] Scene setup incomplete:', setup.error)
        }
        this._lastCaptureGame = this.getPrimaryGame?.() ?? 'valorant'

        const recConfig = this.getRecordingConfig?.()
        if (recConfig) {
          await applyObsRecordingSettings(this._obs, recConfig)
        }

        this.onConnectionChange?.(true)
        return { ok: true, version: obsWebSocketVersion, setup }
      } catch (err) {
        lastRawError = err instanceof Error ? err.message : String(err)
        const now = Date.now()
        if (now - this._lastConnectWarnAt >= 5 * 60 * 1000) {
          log.warn('[OBSRecorder] Connection failed for', url, ':', lastRawError)
          this._lastConnectWarnAt = now
        } else {
          log.debug('[OBSRecorder] Connection failed for', url, ':', lastRawError)
        }
        this._suppressConnectionEvents = true
        try {
          await this._obs.disconnect()
        } catch { /* ignore */ }
        this._suppressConnectionEvents = false
        this._connected = false
      }
    }

    const friendly = formatObsConnectError(lastRawError)
    this._lastError = friendly
    // Failed probe — update UI via lastError; do not pass error (avoids disconnect notifications).
    this.onConnectionChange?.(false)
    return { ok: false, error: friendly }
  }

  async disconnect(): Promise<void> {
    this._suppressConnectionEvents = true
    try { await this._obs.disconnect() } catch { /* ignore */ }
    this._suppressConnectionEvents = false
    this._connected = false
    this._lastCaptureGame = null
    this.onConnectionChange?.(false)
  }

  isConnected(): boolean { return this._connected }

  async setupScene(game = 'valorant', forceSwitchScene = false): Promise<ObsSetupResult> {
    if (!this._connected) {
      const result = await this.connect()
      if (!result.ok) {
        return { ok: false, sceneCreated: false, inputCreated: false, error: result.error }
      }
      return result.setup ?? { ok: true, sceneCreated: false, inputCreated: false }
    }
    return setupUpForgeScene(this._obs, game, {
      switchScene: forceSwitchScene || !this.getSettings().obsPreserveActiveScene,
    })
  }

  private obsSceneOptions(): ObsSceneSwitchOptions {
    return { switchScene: !this.getSettings().obsPreserveActiveScene }
  }

  private retargetOptionsForGame(game: string, forRecording = false): ObsSceneSwitchOptions {
    const gameChanged = this._lastCaptureGame !== null && this._lastCaptureGame !== game
    return {
      ...this.obsSceneOptions(),
      forceRecreate: gameChanged || forRecording,
      refitAfterSettle: gameChanged || forRecording,
    }
  }

  getOBSStatus(): OBSStatus {
    return {
      connected: this._connected,
      recording: this._recording,
      replayBufferActive: this._replayBufferActive,
      outputPath: this._outputPath,
      lastError: this._lastError,
      obsVersion: this._obsVersion,
    }
  }

  // ── Recording interface (DesktopRecorder-compatible) ────────────────────────

  isRecording(): boolean { return this._recording }
  isClipsOnlySession(): boolean { return this._clipsOnlySession }
  getLastRecordingPath(): string | null { return this._outputPath }
  getLastError(): string | null { return this._lastError }
  wasNoAudio(): boolean { return this._noAudio }
  getStartupWarning(): string | null { return this._startupWarning }
  getRecordingDuration(): number {
    if (this._startedAt) {
      return Math.floor((Date.now() - this._startedAt) / 1000)
    }
    return 0
  }
  hadDisconnectedDuringRecording(): boolean { return this._disconnectedDuringRecording }
  getRecordingStartedAt(): number | null { return this._startedAt }

  getLastRecordingSize(): number {
    if (!this._outputPath || !existsSync(this._outputPath)) return 0
    try { return statSync(this._outputPath).size } catch { return 0 }
  }

  async getFreeDiskSpace(savePath: string): Promise<number> {
    const { statfs } = await import('fs/promises')
    try {
      const { bavail, bsize } = await statfs(savePath)
      return bavail * bsize
    } catch { return 0 }
  }

  async preflight(): Promise<{ ok: boolean; error?: string }> {
    if (!this._connected) {
      const result = await this.connect()
      if (!result.ok) return { ok: false, error: `OBS not reachable: ${result.error}` }
    }
    return { ok: true }
  }

  getAudioMode(): string | false | null { return 'obs-websocket' }

  async redetectAudio(): Promise<string | false> { return 'obs-websocket' }

  setStartupEncoder(_e: string, _d: boolean | null): void {}
  pause(): void {}
  isPaused(): boolean { return false }

  deleteRecording(filePath: string): void {
    try {
      const { unlinkSync } = require('fs')
      if (existsSync(filePath)) unlinkSync(filePath)
    } catch {}
  }

  async applyRecordingSettings(config: RecorderConfig): Promise<ObsApplyResult | null> {
    if (!this._connected) return null
    return applyObsRecordingSettings(this._obs, config)
  }

  /** Point OBS capture at the active title (no-op while recording). */
  async retargetCapture(game?: string): Promise<{ ok: boolean; captureWindow?: string }> {
    if (!this._connected || this._recording) {
      return { ok: false }
    }
    const target = game ?? this.getPrimaryGame?.() ?? 'valorant'
    try {
      const { captureWindow } = await retargetUpForgeCapture(
        this._obs,
        target,
        this.retargetOptionsForGame(target),
      )
      this._lastCaptureGame = target
      log.info('[OBSRecorder] Capture retargeted to', target, '→', captureWindow)
      return { ok: true, captureWindow }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.warn('[OBSRecorder] retargetCapture failed:', msg)
      this._lastError = msg
      return { ok: false }
    }
  }

  /**
   * Retry capture setup until the game window exists (CS2/Deadlock often start after the process).
   */
  async retargetCaptureWithRetry(
    game?: string,
    opts?: { maxAttempts?: number; intervalMs?: number },
  ): Promise<{ ok: boolean; captureWindow?: string; liveWindow?: boolean }> {
    const target = game ?? this.getPrimaryGame?.() ?? 'valorant'
    const maxAttempts = opts?.maxAttempts ?? 15
    const intervalMs = opts?.intervalMs ?? 2000

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (!this._connected) {
        const connect = await this.connect()
        if (!connect.ok) return { ok: false }
      }
      if (this._recording) return { ok: false }

      const liveWindow = await findObsWindowString(target)
      const result = await this.retargetCapture(target)
      if (result.ok && liveWindow) {
        return { ok: true, captureWindow: result.captureWindow, liveWindow: true }
      }
      if (result.ok && attempt === maxAttempts) {
        return { ok: true, captureWindow: result.captureWindow, liveWindow: false }
      }
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, intervalMs))
      }
    }
    return { ok: false }
  }

  async start(game: string, config?: RecorderConfig): Promise<void> {
    if (!this._connected) {
      const result = await this.connect()
      if (!result.ok) throw new Error(`Cannot connect to OBS: ${result.error}`)
    }

    if (this._recording) {
      log.warn('[OBSRecorder] Already recording — ignoring start()')
      return
    }

    this._lastError = null
    this._noAudio = false
    this._startupWarning = null
    this._outputPath = null
    this._disconnectedDuringRecording = false
    this._clipsOnlySession = config?.clipsOnly === true

    const saveDir = config?.savePath ?? join(app.getPath('userData'), 'recordings')
    const freeBytes = await getFreeDiskSpace(saveDir)
    if (freeBytes < CRITICAL_FREE_DISK_BYTES) {
      const freeMB = (freeBytes / (1024 * 1024)).toFixed(0)
      this._lastError = `Disk full: only ${freeMB} MB free. Free up disk space before recording.`
      log.error(`[OBSRecorder] ${this._lastError}`)
      this.onStatusChange?.(false, this._lastError)
      throw new Error(this._lastError)
    }
    if (freeBytes < WARN_FREE_DISK_BYTES) {
      const freeGB = (freeBytes / (1024 ** 3)).toFixed(1)
      this._startupWarning = `Low disk space: ${freeGB} GB free. Recordings may fail — upload pending VODs in Settings.`
      log.warn(`[OBSRecorder] ${this._startupWarning}`)
    } else {
      this._startupWarning = null
    }

    try {
      // Game/window capture only — never desktop (privacy / policy safe when alt-tabbing)
      await retargetUpForgeCapture(this._obs, game, this.retargetOptionsForGame(game, true))
      this._lastCaptureGame = game

      if (config) {
        const applyResult = await applyObsRecordingSettings(this._obs, config)
        this._startupWarning = applyResult.warnings[0] ?? null
      } else {
        const savePath = join(app.getPath('userData'), 'recordings')
        await this._obs.call('SetProfileParameter', {
          parameterCategory: 'SimpleOutput',
          parameterName: 'FilePath',
          parameterValue: savePath,
        }).catch(() => { /* non-fatal */ })
        await fitUpForgeCaptureToCanvas(this._obs)
      }

      // Start the full-match recording (skipped in clips-only mode)
      if (!this._clipsOnlySession) {
        await this._obs.call('StartRecord')
      }
      this._startedAt = Date.now()
      this._recording = true
      this.onStatusChange?.(true)
      log.info(
        `[OBSRecorder] ${this._clipsOnlySession ? 'Clips-only session' : 'Recording'} started for game:`,
        game,
      )

      // Start replay buffer alongside the recording
      await this._obs.call('StartReplayBuffer').catch((err) => {
        log.warn('[OBSRecorder] Replay buffer failed to start (non-fatal):', err)
      })

      // Begin polling Riot Live Client API for kill events
      this._startLiveKillPoll()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this._lastError = msg
      this._recording = false
      this._startedAt = null
      this.onStatusChange?.(false, msg)
      throw new Error(`OBS recording failed to start: ${msg}`)
    }
  }

  async stop(): Promise<string | null> {
    this._stopLiveKillPoll()

    if (!this._connected) {
      const reconnect = await this.connect().catch(() => ({ ok: false as const }))
      if (!reconnect.ok) {
        log.warn('[OBSRecorder] Cannot reconnect to OBS — using last known output path')
        return this._outputPath
      }
    }

    let outputActive = this._recording
    try {
      const status = await this._obs.call('GetRecordStatus') as {
        outputActive?: boolean
        outputPath?: string
      }
      if (status.outputPath) this._outputPath = status.outputPath
      if (typeof status.outputActive === 'boolean') outputActive = status.outputActive
    } catch (err) {
      log.warn('[OBSRecorder] GetRecordStatus before stop failed:', err)
    }

    if (!outputActive && !this._recording) {
      this._clipsOnlySession = false
      return this._outputPath
    }

    try {
      if (this._replayBufferActive) {
        await this._obs.call('StopReplayBuffer').catch(() => { /* non-fatal */ })
      }

      if (this._clipsOnlySession) {
        this._recording = false
        this._startedAt = null
        this._clipsOnlySession = false
        this._disconnectedDuringRecording = false
        this._outputPath = null
        this.onStatusChange?.(false)
        log.info('[OBSRecorder] Clips-only session ended')
        return null
      }

      const response = await this._obs.call('StopRecord')
      this._recording = false
      this._startedAt = null
      this._disconnectedDuringRecording = false
      if (response.outputPath) this._outputPath = response.outputPath
      await this._resolveOutputPath()
      if (this._outputPath) {
        await this._waitForRecordingFile(this._outputPath)
      }
      this.onStatusChange?.(false)
      log.info('[OBSRecorder] Recording stopped. Output:', this._outputPath)
      return this._outputPath
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.error('[OBSRecorder] Error stopping recording:', msg)
      this._lastError = msg
      this._recording = false
      this._startedAt = null
      this.onStatusChange?.(false, msg)
      return this._outputPath
    }
  }

  forceStop(): void {
    this._stopLiveKillPoll()
    this._recording = false
    this._startedAt = null
    this._obs.call('StopRecord').catch(() => {})
    this._obs.call('StopReplayBuffer').catch(() => {})
    // Skip UI callbacks during app shutdown — windows/tray may already be destroyed.
  }

  /** OBS may omit outputPath on StopRecord — fall back to GetRecordStatus. */
  private async _resolveOutputPath(): Promise<string | null> {
    if (this._outputPath) return this._outputPath
    try {
      const status = await this._obs.call('GetRecordStatus') as { outputPath?: string }
      if (status.outputPath) {
        this._outputPath = status.outputPath
      }
    } catch (err) {
      log.warn('[OBSRecorder] GetRecordStatus failed:', err)
    }
    return this._outputPath
  }

  /** Wait until the muxed file exists and size has stabilized (OBS writes async after StopRecord). */
  private async _waitForRecordingFile(filePath: string): Promise<void> {
    const pollMs = 500
    const maxWaitMs = 45_000
    let lastSize = -1
    let stableChecks = 0
    const deadline = Date.now() + maxWaitMs

    while (Date.now() < deadline) {
      if (!existsSync(filePath)) {
        await new Promise((r) => setTimeout(r, pollMs))
        continue
      }
      let size = 0
      try {
        size = statSync(filePath).size
      } catch {
        await new Promise((r) => setTimeout(r, pollMs))
        continue
      }
      if (size > 0 && size === lastSize) {
        stableChecks++
        if (stableChecks >= 2) return
      } else {
        stableChecks = 0
      }
      lastSize = size
      await new Promise((r) => setTimeout(r, pollMs))
    }

    log.warn('[OBSRecorder] Timed out waiting for recording file to finalize:', filePath)
  }

  // ── Replay buffer clip saving ────────────────────────────────────────────────

  /**
   * Trigger OBS to save the current replay buffer contents as a clip file.
   * Returns the path to the saved file, or null if it times out / fails.
   */
  async saveReplayClip(timeoutMs = 10_000): Promise<string | null> {
    if (!this._connected || !this._replayBufferActive) return null

    // Serialize saves — if a save is already in flight, skip.
    // A multikill produces overlapping footage anyway; the last save covers the full sequence.
    if (this._savingReplay) {
      log.info('[OBSRecorder] saveReplayClip: save already in progress — skipping (multikill)')
      return null
    }

    this._savingReplay = true
    try {
      const clipPath = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('ReplayBufferSaved timeout')), timeoutMs)
        this._pendingReplaySave = (path) => { clearTimeout(timer); resolve(path) }
        this._obs.call('SaveReplayBuffer').catch((err) => {
          clearTimeout(timer)
          this._pendingReplaySave = null
          reject(err)
        })
      })
      return clipPath
    } catch (err) {
      log.warn('[OBSRecorder] saveReplayClip failed:', err)
      return null
    } finally {
      this._savingReplay = false
    }
  }

  // ── Live kill detection via Riot Local Client API ────────────────────────────

  private _startLiveKillPoll(): void {
    this._seenKillIds.clear()
    this._localPlayerName = null

    // Port 2999 Live Client API is deprecated in modern Valorant — probe once before polling.
    void this._riotGet<{ riotId?: string }>('/liveclientdata/activeplayer')
      .then(() => {
        this._fetchLocalPlayerName()
        this._liveKillPollTimer = setInterval(() => {
          this._pollKillEvents()
        }, 4_000)
      })
      .catch(() => {
        log.info('[OBSRecorder] Live Client API unavailable — OBS kill clips disabled; post-match extraction will still run')
      })
  }

  private _stopLiveKillPoll(): void {
    if (this._liveKillPollTimer) {
      clearInterval(this._liveKillPollTimer)
      this._liveKillPollTimer = null
    }
    this._seenKillIds.clear()
    this._localPlayerName = null
  }

  private _fetchLocalPlayerName(): void {
    this._riotGet<{ riotId: string }>('/liveclientdata/activeplayer')
      .then((data) => {
        if (data?.riotId) {
          this._localPlayerName = data.riotId.split('#')[0]
          log.info('[OBSRecorder] Local player name:', this._localPlayerName)
        }
      })
      .catch(() => { /* pre-game — retry via poll loop */ })
  }

  private async _pollKillEvents(): Promise<void> {
    if (!this._recording || !this._replayBufferActive) return

    try {
      const data = await this._riotGet<{ Events: LiveKillEvent[] }>('/liveclientdata/eventdata')
      if (!data?.Events) return

      // Resolve player name if we don't have it yet
      if (!this._localPlayerName) {
        this._fetchLocalPlayerName()
        return
      }

      for (const evt of data.Events) {
        if (evt.EventName !== 'Kill') continue
        if (this._seenKillIds.has(evt.EventID)) continue
        this._seenKillIds.add(evt.EventID)

        // Only trigger on kills made BY the local player
        if (!evt.KillerName?.toLowerCase().includes(this._localPlayerName.toLowerCase())) continue

        log.info(`[OBSRecorder] Kill detected (EventID=${evt.EventID}) — saving replay buffer`)
        const clipPath = await this.saveReplayClip()
        if (clipPath) {
          log.info('[OBSRecorder] Replay clip saved:', clipPath)
        }
      }
    } catch {
      // Riot API not available between rounds / after match — normal, suppress
    }
  }

  private _riotGet<T>(path: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: '127.0.0.1',
          port: 2999,
          path,
          method: 'GET',
          rejectUnauthorized: false,
          timeout: 1_500,
        },
        (res) => {
          let body = ''
          res.on('data', (d) => { body += d })
          res.on('end', () => {
            try { resolve(JSON.parse(body)) }
            catch { reject(new Error('JSON parse error')) }
          })
        },
      )
      req.on('error', reject)
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
      req.end()
    })
  }
}
