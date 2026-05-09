import { OBSWebSocket } from 'obs-websocket-js'
import { app } from 'electron'
import { existsSync, statSync } from 'fs'
import { join } from 'path'
import https from 'https'
import log from 'electron-log'

export interface OBSSettings {
  host: string
  port: number
  password: string
  replayBufferSeconds: number
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
 * OBSRecorder — Pro tier recording via OBS WebSocket (obs-websocket v5, OBS 28+).
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

  // Live kill polling state
  private _liveKillPollTimer: ReturnType<typeof setInterval> | null = null
  private _seenKillIds = new Set<number>()
  private _localPlayerName: string | null = null

  // Replay clip save — resolves when ReplayBufferSaved fires
  private _pendingReplaySave: ((path: string) => void) | null = null

  onStatusChange?: (recording: boolean, error?: string) => void
  onReplayClipSaved?: (path: string, trigger: string) => void

  constructor(private getSettings: () => OBSSettings) {
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
      log.warn('[OBSRecorder] OBS disconnected')
      this._connected = false
      if (this._recording) {
        this._recording = false
        this._startedAt = null
        this._stopLiveKillPoll()
        this.onStatusChange?.(false, 'OBS disconnected during recording')
      }
    })
  }

  // ── Connection ──────────────────────────────────────────────────────────────

  async connect(): Promise<{ ok: boolean; error?: string; version?: string }> {
    const { host, port, password } = this.getSettings()
    try {
      const { obsWebSocketVersion } = await this._obs.connect(
        `ws://${host}:${port}`,
        password || undefined,
        { rpcVersion: 1 },
      )
      this._connected = true
      this._obsVersion = obsWebSocketVersion
      this._lastError = null
      log.info('[OBSRecorder] Connected to OBS WebSocket', obsWebSocketVersion)
      return { ok: true, version: obsWebSocketVersion }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this._connected = false
      this._lastError = msg
      log.warn('[OBSRecorder] Connection failed:', msg)
      return { ok: false, error: msg }
    }
  }

  async disconnect(): Promise<void> {
    try { await this._obs.disconnect() } catch { /* ignore */ }
    this._connected = false
  }

  isConnected(): boolean { return this._connected }

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
  getLastRecordingPath(): string | null { return this._outputPath }
  getLastError(): string | null { return this._lastError }
  wasNoAudio(): boolean { return this._noAudio }
  getStartupWarning(): string | null { return null }
  getRecordingDuration(): number {
    return this._startedAt ? Math.floor((Date.now() - this._startedAt) / 1000) : 0
  }
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

  async start(game: string, _config?: unknown): Promise<void> {
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
    this._outputPath = null

    try {
      // Configure OBS output path to match our recordings folder
      const savePath = join(app.getPath('userData'), 'recordings')
      await this._obs.call('SetProfileParameter', {
        parameterCategory: 'SimpleOutput',
        parameterName: 'FilePath',
        parameterValue: savePath,
      }).catch(() => { /* non-fatal — OBS may handle path differently */ })

      // Start the full-match recording
      await this._obs.call('StartRecord')
      this._startedAt = Date.now()
      this._recording = true
      this.onStatusChange?.(true)
      log.info('[OBSRecorder] Recording started for game:', game)

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

    if (!this._recording) return this._outputPath

    try {
      // Stop replay buffer first
      if (this._replayBufferActive) {
        await this._obs.call('StopReplayBuffer').catch(() => { /* non-fatal */ })
      }

      // Stop the main recording — response includes the output path
      const response = await this._obs.call('StopRecord')
      this._recording = false
      this._startedAt = null
      if (response.outputPath) this._outputPath = response.outputPath
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
    this.onStatusChange?.(false)
  }

  // ── Replay buffer clip saving ────────────────────────────────────────────────

  /**
   * Trigger OBS to save the current replay buffer contents as a clip file.
   * Returns the path to the saved file, or null if it times out / fails.
   */
  async saveReplayClip(timeoutMs = 10_000): Promise<string | null> {
    if (!this._connected || !this._replayBufferActive) return null

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
    }
  }

  // ── Live kill detection via Riot Local Client API ────────────────────────────

  private _startLiveKillPoll(): void {
    this._seenKillIds.clear()
    this._localPlayerName = null

    // First, resolve the local player's name from the active-player endpoint
    this._fetchLocalPlayerName()

    this._liveKillPollTimer = setInterval(() => {
      this._pollKillEvents()
    }, 2_000)
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
