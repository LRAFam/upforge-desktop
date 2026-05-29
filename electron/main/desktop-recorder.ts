import { ipcMain, WebContents, app } from 'electron'
import { createWriteStream, WriteStream, existsSync, mkdirSync, statSync, unlinkSync, writeFileSync, rmSync, renameSync } from 'fs'
import { statfs } from 'fs/promises'
import { join, parse } from 'path'
import { spawn } from 'child_process'
import { is } from '@electron-toolkit/utils'

const IS_WIN = process.platform === 'win32'

/** Resolve the bundled ffmpeg binary path — mirrors Recorder._ffmpegPath(). */
function ffmpegBinaryPath(): string {
  if (is.dev) return IS_WIN ? 'ffmpeg.exe' : 'ffmpeg'
  const binary = IS_WIN ? 'ffmpeg.exe' : 'ffmpeg'
  return join(process.resourcesPath, 'ffmpeg', binary)
}

/**
 * Remux a raw MediaRecorder WebM file so it has proper duration and Cue (seek) entries.
 * MediaRecorder writes WebM as a "live" stream — no duration metadata, no seek table.
 * ffmpeg -c copy rewrites the container headers in seconds without re-encoding any video.
 * Returns the path of the fixed file (same path as input), or null if ffmpeg is unavailable.
 */
async function fixWebmDuration(inputPath: string): Promise<string | null> {
  return new Promise((resolve) => {
    const ffmpeg = ffmpegBinaryPath()
    if (!existsSync(ffmpeg) && (ffmpeg.includes('/') || ffmpeg.includes('\\'))) {
      // bundled ffmpeg not found — skip remux silently
      resolve(null)
      return
    }

    const { dir, name, ext } = parse(inputPath)
    const fixedPath = join(dir, `${name}_fixed${ext}`)

    const args = ['-y', '-i', inputPath, '-c', 'copy', fixedPath]
    const proc = spawn(ffmpeg, args, { stdio: 'pipe' })

    let stderr = ''
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString() })

    proc.on('close', (code) => {
      if (code === 0 && existsSync(fixedPath)) {
        try {
          unlinkSync(inputPath)
          renameSync(fixedPath, inputPath)
          resolve(inputPath)
        } catch (err) {
          console.warn('[DesktopRecorder] Could not replace WebM with fixed version:', err)
          // Leave the fixed file as-is, return it
          resolve(fixedPath)
        }
      } else {
        console.warn('[DesktopRecorder] ffmpeg remux failed (code=%d): %s', code, stderr.slice(-500))
        // Clean up partial output if it exists
        if (existsSync(fixedPath)) { try { unlinkSync(fixedPath) } catch { /* ignore */ } }
        resolve(null)
      }
    })

    proc.on('error', (err) => {
      console.warn('[DesktopRecorder] ffmpeg spawn error:', err.message)
      resolve(null)
    })
  })
}


/** Returns true if we can actually create files inside `dir`. */
function isDirectoryWritable(dir: string): boolean {
  try {
    mkdirSync(dir, { recursive: true })
    const probe = join(dir, `.upforge_write_test_${Date.now()}`)
    writeFileSync(probe, '')
    rmSync(probe)
    return true
  } catch {
    return false
  }
}

export interface RecorderConfig {
  quality: '720p' | '1080p'
  bitrate: number
  fps?: 24 | 30 | 60
  audioEnabled?: boolean
  savePath: string
  captureMonitor?: 'auto' | number
}

/**
 * DesktopRecorder — uses Electron's desktopCapturer + MediaRecorder in the renderer
 * for reliable cross-platform capture without any ffmpeg audio driver fragility.
 *
 * The renderer handles getUserMedia/MediaRecorder and streams WebM chunks back
 * via IPC. This process writes chunks to disk incrementally.
 *
 * Public interface is compatible with the ffmpeg-based Recorder class so either
 * can be used as a drop-in from index.ts / ipc-handlers.ts.
 */
export class DesktopRecorder {
  private _recording = false
  private _outputPath: string | null = null
  private _startedAt: number | null = null
  private _lastError: string | null = null
  private _noAudio = false
  private _writeStream: WriteStream | null = null
  private _pendingStart: { resolve: () => void; reject: (e: Error) => void } | null = null
  private _pendingStop: { resolve: (path: string | null) => void } | null = null
  private _stopTimeout: NodeJS.Timeout | null = null
  private _handlersRegistered = false

  onStatusChange?: (recording: boolean, error?: string) => void

  constructor(private getMainWebContents: () => WebContents | null) {
    this._registerIpcHandlers()
  }

  private _registerIpcHandlers() {
    if (this._handlersRegistered) return
    this._handlersRegistered = true

    // First chunk confirms recording has actually started in the renderer.
    // We resolve the pending start promise here rather than on 'started' to ensure
    // data is actually flowing before we tell the rest of the app we're recording.
    ipcMain.on('desktop-recording:chunk', (_event, chunk: ArrayBuffer) => {
      if (!this._writeStream) return
      this._writeStream.write(Buffer.from(chunk))

      if (this._pendingStart) {
        const { resolve } = this._pendingStart
        this._pendingStart = null
        this._recording = true
        this._startedAt = Date.now()
        this.onStatusChange?.(true)
        resolve()
      }
    })

    ipcMain.on('desktop-recording:started', (_event, noAudio: boolean) => {
      this._noAudio = noAudio
      if (noAudio) console.warn('[DesktopRecorder] Recording started without audio (fallback to video-only)')
    })

    ipcMain.on('desktop-recording:complete', () => {
      if (!this._writeStream) return
      this._writeStream.end(async () => {
        this._writeStream = null
        this._recording = false
        this._startedAt = null
        if (this._stopTimeout) { clearTimeout(this._stopTimeout); this._stopTimeout = null }
        const pending = this._pendingStop
        this._pendingStop = null
        this.onStatusChange?.(false)

        // Remux the raw MediaRecorder WebM to add proper duration + Cue seek table.
        // This is a fast container-only rewrite (no re-encoding).
        if (this._outputPath && existsSync(this._outputPath)) {
          const fixed = await fixWebmDuration(this._outputPath)
          if (fixed) {
            console.info('[DesktopRecorder] WebM duration fixed:', fixed)
          }
        }

        pending?.resolve(this._outputPath)
      })
    })

    ipcMain.on('desktop-recording:error', (_event, message: string) => {
      console.error('[DesktopRecorder] Renderer reported error:', message)
      this._lastError = message
      if (this._writeStream) { this._writeStream.destroy(); this._writeStream = null }
      this._recording = false
      this._startedAt = null
      if (this._stopTimeout) { clearTimeout(this._stopTimeout); this._stopTimeout = null }

      if (this._pendingStart) {
        const { reject } = this._pendingStart
        this._pendingStart = null
        reject(new Error(message))
        return
      }
      if (this._pendingStop) {
        const pending = this._pendingStop
        this._pendingStop = null
        pending.resolve(this._outputPath)
      }
      this.onStatusChange?.(false, message)
    })
  }

  // ── Public interface (compatible with ffmpeg Recorder) ──

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
    try {
      const { bavail, bsize } = await statfs(savePath)
      return bavail * bsize
    } catch { return 0 }
  }

  /** No ffmpeg binary needed for desktop capture — always ok. */
  async preflight(): Promise<{ ok: boolean; error?: string }> {
    return { ok: true }
  }

  /** No-op — no encoder detection needed for desktopCapturer recording. */
  setStartupEncoder(_encoder: string, _useDdagrab: boolean | null): void {}

  getAudioMode(): string | false | null {
    // 'desktop-capturer' signals the renderer-based audio path to Settings UI
    return 'desktop-capturer'
  }

  async redetectAudio(): Promise<string | false> {
    return 'desktop-capturer'
  }

  deleteRecording(filePath: string): void {
    try { if (existsSync(filePath)) unlinkSync(filePath) } catch {}
  }

  pause(): void {}
  isPaused(): boolean { return false }

  async start(game: string, config?: RecorderConfig): Promise<void> {
    if (this._recording) {
      console.warn('[DesktopRecorder] Already recording — ignoring start()')
      return
    }

    this._lastError = null
    this._noAudio = false
    this._startedAt = null

    const fallbackDir = join(app.getPath('userData'), 'recordings')
    let dir = config?.savePath ?? fallbackDir

    // Guard against drive roots or unwritable paths (e.g. C:\) — fall back to userData
    if (!isDirectoryWritable(dir)) {
      console.warn(`[DesktopRecorder] savePath "${dir}" is not writable — falling back to default recordings folder`)
      dir = fallbackDir
      mkdirSync(dir, { recursive: true })
    }

    this._outputPath = join(dir, `${game}_${Date.now()}.webm`)

    const contents = this.getMainWebContents()
    if (!contents) throw new Error('[DesktopRecorder] Main window not ready — cannot start recording')

    this._writeStream = createWriteStream(this._outputPath)

    contents.send('desktop-recording:start', {
      quality: config?.quality ?? '1080p',
      bitrate: config?.bitrate ?? 8,
      fps: config?.fps ?? 60,
      audioEnabled: config?.audioEnabled !== false,
      game,
    })

    // Wait for first chunk to confirm recording is actually flowing (15s timeout)
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this._pendingStart) {
          this._pendingStart = null
          if (this._writeStream) { this._writeStream.destroy(); this._writeStream = null }
          reject(new Error('[DesktopRecorder] Recording did not start within 15 seconds — check Screen Recording permissions and codec support'))
        }
      }, 15_000)

      this._pendingStart = {
        resolve: () => { clearTimeout(timeout); resolve() },
        reject: (e) => { clearTimeout(timeout); reject(e) },
      }
    })
  }

  async stop(): Promise<string | null> {
    if (!this._recording) {
      this._startedAt = null
      return this._outputPath
    }

    const contents = this.getMainWebContents()
    contents?.send('desktop-recording:stop')

    return new Promise<string | null>((resolve) => {
      // Force-resolve after 15s in case the renderer never sends 'complete'.
      // Wait for the writeStream to fully flush before resolving so the file isn't truncated.
      this._stopTimeout = setTimeout(() => {
        console.warn('[DesktopRecorder] Stop timed out — finalising anyway')
        this._recording = false
        this._startedAt = null
        this._pendingStop = null
        if (this._writeStream) {
          const ws = this._writeStream
          this._writeStream = null
          ws.end(() => resolve(this._outputPath))
        } else {
          resolve(this._outputPath)
        }
      }, 15_000)

      this._pendingStop = { resolve }
    })
  }

  forceStop(): void {
    const contents = this.getMainWebContents()
    contents?.send('desktop-recording:stop')
    this._recording = false
    this._startedAt = null
    if (this._writeStream) { this._writeStream.destroy(); this._writeStream = null }
    if (this._stopTimeout) { clearTimeout(this._stopTimeout); this._stopTimeout = null }
    this._pendingStart = null
    this._pendingStop = null
  }
}
