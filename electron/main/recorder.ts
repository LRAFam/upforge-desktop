import { spawn, ChildProcess } from 'child_process'
import { join } from 'path'
import { app } from 'electron'
import { existsSync, mkdirSync, unlinkSync, statSync } from 'fs'
import { statfs } from 'fs/promises'
import { is } from '@electron-toolkit/utils'

type HWEncoder = 'videotoolbox' | 'nvenc' | 'amf' | 'qsv' | 'software'

export interface RecorderConfig {
  quality: '720p' | '1080p'
  bitrate: number // Mbps
  savePath: string
}

const IS_MAC = process.platform === 'darwin'
const IS_WIN = process.platform === 'win32'

// Window titles for each supported game (used for window-specific capture on Windows).
// gdigrab's -i title= matches the foreground window title exactly.
const GAME_WINDOW_TITLES: Record<string, string> = {
  valorant: 'VALORANT',
}

export class Recorder {
  private _process: ChildProcess | null = null
  private _outputPath: string | null = null
  private _recording = false
  private _lastError: string | null = null
  private _stderrBuffer = ''
  private _startedAt: number | null = null
  onStatusChange?: (recording: boolean, error?: string) => void

  isRecording(): boolean {
    return this._recording
  }

  getLastRecordingPath(): string | null {
    return this._outputPath
  }

  getLastError(): string | null {
    return this._lastError
  }

  /** Returns recording duration in seconds (0 if not started). */
  getRecordingDuration(): number {
    if (!this._startedAt) return 0
    return Math.floor((Date.now() - this._startedAt) / 1000)
  }

  /** Returns file size in bytes of the last recording (0 if missing). */
  getLastRecordingSize(): number {
    if (!this._outputPath || !existsSync(this._outputPath)) return 0
    try { return statSync(this._outputPath).size } catch { return 0 }
  }

  /** Check free disk space at the save path. Returns bytes available. */
  async getFreeDiskSpace(savePath: string): Promise<number> {
    try {
      const stats = await statfs(savePath)
      return stats.bfree * stats.bsize
    } catch {
      return Infinity // can't check — don't block recording
    }
  }

  /** Check that the ffmpeg binary exists and can run. Call before starting detection. */
  async preflight(): Promise<{ ok: boolean; error?: string }> {
    const ffmpegPath = this._ffmpegPath()

    // For absolute paths, check the file exists first
    if (ffmpegPath.includes('/') || ffmpegPath.includes('\\')) {
      if (!existsSync(ffmpegPath)) {
        return { ok: false, error: `ffmpeg binary not found at: ${ffmpegPath}` }
      }
    }

    return new Promise((resolve) => {
      const proc = spawn(ffmpegPath, ['-version'], { stdio: 'pipe' })
      let stderr = ''
      proc.stderr?.on('data', (d) => { stderr += d.toString() })
      proc.on('exit', (code) => resolve(code === 0 ? { ok: true } : { ok: false, error: `ffmpeg exited with code ${code}: ${stderr.slice(0, 200)}` }))
      proc.on('error', (err) => resolve({ ok: false, error: err.message }))
      setTimeout(() => { proc.kill(); resolve({ ok: false, error: 'ffmpeg version check timed out' }) }, 5000)
    })
  }

  async start(game: string, config?: RecorderConfig): Promise<void> {
    if (this._recording) {
      console.warn('[Recorder] Already recording, ignoring start()')
      return
    }

    this._lastError = null
    this._stderrBuffer = ''

    const dir = config?.savePath ?? join(app.getPath('userData'), 'recordings')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

    const timestamp = Date.now()
    this._outputPath = join(dir, `${game}_${timestamp}.mp4`)

    const encoder = await this._detectEncoder()
    const ffmpegPath = this._ffmpegPath()
    const args = this._buildArgs(encoder, this._outputPath, game, config)

    console.log(`[Recorder] Platform: ${process.platform}, encoder: ${encoder}`)
    console.log(`[Recorder] ffmpeg path: ${ffmpegPath}`)
    console.log(`[Recorder] Output: ${this._outputPath}`)
    console.log(`[Recorder] Args: ${args.join(' ')}`)

    this._process = spawn(ffmpegPath, args, { stdio: 'pipe' })
    this._recording = true
    this._startedAt = Date.now()
    this.onStatusChange?.(true)

    // Capture stderr so we can surface real ffmpeg error messages
    this._process.stderr?.on('data', (data: Buffer) => {
      this._stderrBuffer += data.toString()
      // Keep only the last 2KB to avoid memory growth during long recordings
      if (this._stderrBuffer.length > 2048) {
        this._stderrBuffer = this._stderrBuffer.slice(-2048)
      }
    })

    this._process.on('error', (err) => {
      console.error('[Recorder] ffmpeg process error:', err.message)
      this._lastError = err.message
      this._recording = false
      this.onStatusChange?.(false, err.message)
    })

    this._process.on('exit', (code) => {
      console.log(`[Recorder] ffmpeg exited with code ${code}`)
      this._recording = false
      if (code !== 0 && code !== null) {
        // Extract last meaningful line from stderr as the error reason
        const lines = this._stderrBuffer.trim().split('\n').filter(Boolean)
        this._lastError = lines.at(-1) ?? `ffmpeg exited with code ${code}`
        console.error('[Recorder] ffmpeg last stderr line:', this._lastError)
        this.onStatusChange?.(false, this._lastError)
      } else {
        this.onStatusChange?.(false)
      }
    })
  }

  async stop(): Promise<string | null> {
    if (!this._process || !this._recording) {
      return null
    }

    return new Promise((resolve) => {
      const outputPath = this._outputPath

      this._process!.once('exit', () => {
        this._recording = false
        this._process = null
        resolve(outputPath)
      })

      // Send 'q' to ffmpeg stdin for graceful stop (finishes writing MP4)
      this._process!.stdin?.write('q')
      this._process!.stdin?.end()

      // Force kill after 10s if graceful stop doesn't work
      setTimeout(() => {
        if (this._process) {
          this._process.kill('SIGTERM')
          resolve(outputPath)
        }
      }, 10000)
    })
  }

  forceStop(): void {
    if (this._process) {
      this._process.kill('SIGKILL')
      this._process = null
      this._recording = false
    }
  }

  deleteRecording(filePath: string): void {
    try {
      if (existsSync(filePath)) {
        unlinkSync(filePath)
        console.log('[Recorder] Deleted temp recording:', filePath)
      }
    } catch (err) {
      console.error('[Recorder] Failed to delete recording:', err)
    }
  }

  private async _detectEncoder(): Promise<HWEncoder> {
    const ffmpegPath = this._ffmpegPath()

    if (IS_MAC) {
      const works = await this._testEncoder(ffmpegPath, 'h264_videotoolbox')
      return works ? 'videotoolbox' : 'software'
    }

    // Windows: try hardware encoders in priority order
    const encoders: Array<{ name: HWEncoder; codec: string }> = [
      { name: 'nvenc', codec: 'h264_nvenc' },
      { name: 'amf', codec: 'h264_amf' },
      { name: 'qsv', codec: 'h264_qsv' }
    ]

    for (const { name, codec } of encoders) {
      const works = await this._testEncoder(ffmpegPath, codec)
      if (works) {
        console.log(`[Recorder] Hardware encoder available: ${name}`)
        return name
      }
    }

    console.log('[Recorder] No hardware encoder found, falling back to software')
    return 'software'
  }

  private _testEncoder(ffmpegPath: string, codec: string): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn(ffmpegPath, [
        '-f', 'lavfi', '-i', 'nullsrc=s=1280x720:d=1',
        '-vcodec', codec,
        '-f', 'null', '-'
      ], { stdio: 'pipe' })

      proc.on('exit', (code) => resolve(code === 0))
      proc.on('error', () => resolve(false))
      setTimeout(() => { proc.kill(); resolve(false) }, 5000)
    })
  }

  private _buildArgs(encoder: HWEncoder, outputPath: string, game: string, config?: RecorderConfig): string[] {
    const codecMap: Record<HWEncoder, string> = {
      videotoolbox: 'h264_videotoolbox',
      nvenc: 'h264_nvenc',
      amf: 'h264_amf',
      qsv: 'h264_qsv',
      software: 'libx264'
    }

    const codec = codecMap[encoder]
    const bitrate = config?.bitrate ?? 4
    const bitrateStr = `${bitrate}M`
    const maxrateStr = `${Math.round(bitrate * 1.5)}M`
    const bufsizeStr = `${bitrate * 2}M`
    const scale = config?.quality === '1080p' ? '1920:1080' : '1280:720'

    const qualityArgs = encoder === 'software'
      ? ['-crf', '28', '-preset', 'veryfast']
      : encoder === 'videotoolbox'
        ? ['-b:v', bitrateStr]
        : ['-b:v', bitrateStr, '-maxrate', maxrateStr, '-bufsize', bufsizeStr]

    if (IS_MAC) {
      return [
        '-f', 'avfoundation',
        '-framerate', '30',
        '-i', '1:0',
        '-vf', `scale=${scale}`,
        '-vcodec', codec,
        ...qualityArgs,
        '-acodec', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        outputPath
      ]
    }

    // Windows: capture the game window by title so only the game is recorded.
    // WASAPI loopback captures all system audio (game sounds + voice chat).
    // Fall back to full desktop if no window title is registered for this game.
    const windowTitle = GAME_WINDOW_TITLES[game.toLowerCase()]
    const captureInput = windowTitle ? `title=${windowTitle}` : 'desktop'
    console.log(`[Recorder] Windows capture input: ${captureInput}`)
    return [
      '-f', 'gdigrab',
      '-framerate', '30',
      '-i', captureInput,
      '-f', 'wasapi',
      '-i', 'loopback',
      '-map', '0:v',
      '-map', '1:a',
      '-vf', `scale=${scale}`,
      '-vcodec', codec,
      ...qualityArgs,
      '-acodec', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      outputPath
    ]
  }

  private _ffmpegPath(): string {
    if (is.dev) {
      // In dev, expect ffmpeg in PATH on both Mac and Windows
      return IS_WIN ? 'ffmpeg.exe' : 'ffmpeg'
    }
    // In production, use bundled ffmpeg
    const binary = IS_WIN ? 'ffmpeg.exe' : 'ffmpeg'
    return join(process.resourcesPath, 'ffmpeg', binary)
  }
}
