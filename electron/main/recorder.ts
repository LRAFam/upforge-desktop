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
  captureMonitor?: 'auto' | number // which monitor to capture; 'auto' = detect from Valorant window
}

const IS_MAC = process.platform === 'darwin'
const IS_WIN = process.platform === 'win32'

// Window titles for each supported game (used for window-specific capture on Windows).
// gdigrab's -i title= matches the foreground window title exactly.
const GAME_WINDOW_TITLES: Record<string, string> = {
  valorant: 'VALORANT',
}

// Window position info for targeted capture — avoids recording full virtual desktop on multi-monitor setups.
interface WindowInfo {
  x: number
  y: number
  width: number
  height: number
  monitorIndex: number // 0-based DXGI output index for ddagrab / AllScreens index for gdigrab
}

export class Recorder {
  private _process: ChildProcess | null = null
  private _outputPath: string | null = null
  private _recording = false
  private _lastError: string | null = null
  private _stderrBuffer = ''
  private _startedAt: number | null = null
  private _cachedEncoder: HWEncoder | null = null
  private _cachedUseDdagrab: boolean | null = null
  private _recordedWithoutAudio = false
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

  /** Returns true if the current/last recording was started without audio (fallback). */
  wasNoAudio(): boolean {
    return this._recordedWithoutAudio
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
    this._recordedWithoutAudio = false

    const dir = config?.savePath ?? join(app.getPath('userData'), 'recordings')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

    const timestamp = Date.now()
    this._outputPath = join(dir, `${game}_${timestamp}.mp4`)

    const encoder = await this._detectEncoder()
    console.log(`[Recorder] Platform: ${process.platform}, encoder: ${encoder}`)
    console.log(`[Recorder] Output: ${this._outputPath}`)

    // Detect which monitor the game is running on so we only capture that screen.
    // This prevents the dual-monitor "full virtual desktop" capture when falling back from window title.
    let windowInfo: WindowInfo | null = null
    if (IS_WIN) {
      const monitorOverride = config?.captureMonitor
      if (typeof monitorOverride === 'number') {
        // Manual override: user has selected a specific monitor in settings
        windowInfo = null // use override index in _buildArgs directly
        console.log(`[Recorder] Monitor override: output_idx=${monitorOverride}`)
      } else {
        windowInfo = await this._getValorantWindowInfo()
        if (windowInfo) {
          console.log(`[Recorder] Valorant window: ${windowInfo.x},${windowInfo.y} ${windowInfo.width}x${windowInfo.height} monitor=${windowInfo.monitorIndex}`)
        } else {
          console.warn('[Recorder] Could not detect Valorant window — will use primary monitor')
        }
      }
    }

    const useDdagrab = IS_WIN && this._cachedUseDdagrab === true
    await this._spawnAndConfirm(game, config, encoder, false, false, useDdagrab, windowInfo)
  }

  /**
   * Spawns ffmpeg and waits up to 2s to confirm it is actually running before
   * declaring recording started. If ffmpeg dies within that window (e.g. ddagrab
   * unavailable, window title not found, WASAPI unavailable) we catch the real
   * error and retry with progressively simpler capture strategies.
   */
  private async _spawnAndConfirm(
    game: string,
    config: RecorderConfig | undefined,
    encoder: HWEncoder,
    useDesktopFallback: boolean,
    noAudio: boolean = false,
    useDdagrab: boolean = false,
    windowInfo: WindowInfo | null = null
  ): Promise<void> {
    const STARTUP_TIMEOUT_MS = 2000
    const ffmpegPath = this._ffmpegPath()
    const args = this._buildArgs(encoder, this._outputPath!, game, config, useDesktopFallback, noAudio, useDdagrab, windowInfo)

    console.log(`[Recorder] ffmpeg path: ${ffmpegPath}`)
    console.log(`[Recorder] Args: ${args.join(' ')}`)

    let earlyExited = false
    let earlyError: string | null = null

    this._process = spawn(ffmpegPath, args, { stdio: 'pipe' })

    // Lower ffmpeg priority on Windows so it doesn't compete with Valorant for CPU.
    // We do this asynchronously after spawn — no need to wait.
    if (IS_WIN && this._process.pid) {
      this._lowerProcessPriority(this._process.pid)
    }

    this._process.stderr?.on('data', (data: Buffer) => {
      this._stderrBuffer += data.toString()
      if (this._stderrBuffer.length > 2048) {
        this._stderrBuffer = this._stderrBuffer.slice(-2048)
      }
    })

    this._process.on('error', (err) => {
      if (!earlyExited) earlyError = err.message
      earlyExited = true
      if (this._recording) {
        this._lastError = err.message
        this._recording = false
        this.onStatusChange?.(false, err.message)
      }
    })

    this._process.on('exit', (code) => {
      console.log(`[Recorder] ffmpeg exited with code ${code}`)
      if (!earlyExited && code !== 0 && code !== null) {
        const lines = this._stderrBuffer.trim().split('\n').filter(Boolean)
        earlyError = lines.at(-1) ?? `ffmpeg exited with code ${code}`
      }
      earlyExited = true
      if (this._recording) {
        this._recording = false
        if (code !== 0 && code !== null) {
          const lines = this._stderrBuffer.trim().split('\n').filter(Boolean)
          this._lastError = lines.at(-1) ?? `ffmpeg exited with code ${code}`
          console.error('[Recorder] ffmpeg last stderr line:', this._lastError)
          this.onStatusChange?.(false, this._lastError)
        } else {
          this.onStatusChange?.(false)
        }
      }
    })

    // Wait for startup confirmation window
    await new Promise<void>(resolve => setTimeout(resolve, STARTUP_TIMEOUT_MS))

    if (earlyExited) {
      const reason = earlyError ?? 'ffmpeg failed to start'
      console.error(`[Recorder] ffmpeg failed within startup window: ${reason}`)
      console.error(`[Recorder] Full stderr:\n${this._stderrBuffer.slice(-1000)}`)

      // If ddagrab failed (DDA unavailable — Windows 7, driver issue, etc.),
      // fall back to gdigrab immediately. Cache the result so we don't retry each recording.
      if (useDdagrab) {
        console.warn('[Recorder] ddagrab failed — falling back to gdigrab:', reason)
        this._cachedUseDdagrab = false
        this._stderrBuffer = ''
        this._process = null
        return this._spawnAndConfirm(game, config, encoder, useDesktopFallback, noAudio, false, windowInfo)
      }

      // On Windows, if window-title capture failed, retry with targeted desktop crop.
      // If we have window position info, we crop to just the game window instead of
      // capturing the entire virtual desktop (which includes all monitors).
      if (IS_WIN && !useDesktopFallback && GAME_WINDOW_TITLES[game.toLowerCase()]) {
        console.warn('[Recorder] Window capture failed — retrying with desktop crop capture')
        this._stderrBuffer = ''
        this._process = null
        return this._spawnAndConfirm(game, config, encoder, true, noAudio, false, windowInfo)
      }

      // If audio capture failed, retry without audio (WASAPI unavailable / invalid device).
      // Check the FULL stderr buffer — the last line is often just "Conversion failed!"
      // while the real audio error is buried earlier.
      if (!noAudio) {
        const bufferLower = this._stderrBuffer.toLowerCase()
        const audioFailed = bufferLower.includes('wasapi') || bufferLower.includes('loopback') ||
          bufferLower.includes('invalid argument') || bufferLower.includes('coinitialization') ||
          (IS_MAC && bufferLower.includes('avfoundation') && bufferLower.includes(':0'))
        if (audioFailed) {
          console.warn('[Recorder] Audio capture failed — retrying without audio:', reason)
          this._stderrBuffer = ''
          this._process = null
          return this._spawnAndConfirm(game, config, encoder, useDesktopFallback, true, useDdagrab, windowInfo)
        }
      }

      this._lastError = reason
      throw new Error(reason)
    }

    // ffmpeg is still alive after startup window — recording confirmed
    this._recording = true
    this._startedAt = Date.now()
    if (noAudio) this._recordedWithoutAudio = true
    this.onStatusChange?.(true)
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
    if (this._cachedEncoder) {
      console.log(`[Recorder] Using cached encoder: ${this._cachedEncoder}`)
      return this._cachedEncoder
    }

    const ffmpegPath = this._ffmpegPath()

    if (IS_MAC) {
      const works = await this._testEncoder(ffmpegPath, 'h264_videotoolbox')
      this._cachedEncoder = works ? 'videotoolbox' : 'software'
      return this._cachedEncoder
    }

    // Windows: test ddagrab availability and hardware encoders in parallel to reduce startup time.
    // ddagrab uses the Desktop Duplication API (DirectX11/DXGI) — GPU-accelerated screen capture
    // with near-zero CPU overhead. Much lighter than gdigrab which copies the framebuffer via GDI.
    const [ddagrabWorks, nvencWorks, amfWorks, qsvWorks] = await Promise.all([
      this._testDdagrab(ffmpegPath),
      this._testEncoder(ffmpegPath, 'h264_nvenc'),
      this._testEncoder(ffmpegPath, 'h264_amf'),
      this._testEncoder(ffmpegPath, 'h264_qsv'),
    ])

    this._cachedUseDdagrab = ddagrabWorks
    console.log(`[Recorder] ddagrab (Desktop Duplication API) available: ${ddagrabWorks}`)

    const encoderResults = [nvencWorks, amfWorks, qsvWorks]
    const encoders: Array<{ name: HWEncoder; codec: string }> = [
      { name: 'nvenc', codec: 'h264_nvenc' },
      { name: 'amf', codec: 'h264_amf' },
      { name: 'qsv', codec: 'h264_qsv' }
    ]

    for (let i = 0; i < encoders.length; i++) {
      if (encoderResults[i]) {
        console.log(`[Recorder] Hardware encoder available: ${encoders[i].name}`)
        this._cachedEncoder = encoders[i].name
        return encoders[i].name
      }
    }

    console.log('[Recorder] No hardware encoder found, falling back to software')
    this._cachedEncoder = 'software'
    return 'software'
  }

  private _testDdagrab(ffmpegPath: string): Promise<boolean> {
    if (!IS_WIN) return Promise.resolve(false)
    return new Promise((resolve) => {
      // Capture a single frame via Desktop Duplication API to confirm DDA is available.
      // Requires Windows 8+ and a D3D11-capable GPU (all modern gaming hardware).
      const proc = spawn(ffmpegPath, [
        '-filter_complex', 'ddagrab=output_idx=0,hwdownload,format=bgr0',
        '-frames:v', '1',
        '-f', 'null', '-'
      ], { stdio: 'pipe' })

      proc.on('exit', (code) => resolve(code === 0))
      proc.on('error', () => resolve(false))
      setTimeout(() => { proc.kill(); resolve(false) }, 5000)
    })
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

  private _buildArgs(encoder: HWEncoder, outputPath: string, game: string, config?: RecorderConfig, useDesktopFallback = false, noAudio = false, useDdagrab = false, windowInfo: WindowInfo | null = null): string[] {
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

    // software: ultrafast preset to minimise CPU usage (quality traded for performance)
    const qualityArgs = encoder === 'software'
      ? ['-crf', '28', '-preset', 'ultrafast']
      : encoder === 'videotoolbox'
        ? ['-b:v', bitrateStr]
        : ['-b:v', bitrateStr, '-maxrate', maxrateStr, '-bufsize', bufsizeStr]

    if (IS_MAC) {
      // noAudio: capture video device only (no audio index after colon)
      const input = noAudio ? '1' : '1:0'
      if (noAudio) console.log('[Recorder] Mac: recording without audio (avfoundation device 1)')
      return [
        '-f', 'avfoundation',
        '-framerate', '30',
        '-i', input,
        '-vf', `scale=${scale}`,
        '-vcodec', codec,
        ...qualityArgs,
        ...(noAudio ? [] : ['-acodec', 'aac', '-b:a', '128k']),
        '-movflags', '+faststart',
        outputPath
      ]
    }

    // Windows: ddagrab path — Desktop Duplication API (GPU-accelerated, near-zero CPU overhead).
    // Preferred over gdigrab because DDA captures frames in GPU memory, avoiding the GDI
    // framebuffer copy that causes CPU spikes while playing games.
    if (useDdagrab) {
      // Use detected monitor index so we capture the screen Valorant is actually on.
      // Manual override from settings takes priority over auto-detection.
      const monitorOverride = config?.captureMonitor
      const outputIdx = typeof monitorOverride === 'number'
        ? monitorOverride
        : (windowInfo?.monitorIndex ?? 0)
      console.log(`[Recorder] Windows ddagrab (DDA) capture output_idx=${outputIdx}${noAudio ? ' (no audio)' : ''}`)

      // scale is applied inside the filter_complex — can't mix -filter_complex with -vf
      const ddagrabFilter = `ddagrab=output_idx=${outputIdx},hwdownload,format=bgr0,scale=${scale}[v]`

      if (noAudio) {
        return [
          '-filter_complex', ddagrabFilter,
          '-map', '[v]',
          '-vcodec', codec,
          ...qualityArgs,
          '-movflags', '+faststart',
          outputPath
        ]
      }

      return [
        '-f', 'wasapi',
        '-thread_queue_size', '512',
        '-i', 'loopback',
        '-filter_complex', ddagrabFilter,
        '-map', '0:a',
        '-map', '[v]',
        '-vcodec', codec,
        ...qualityArgs,
        '-acodec', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        outputPath
      ]
    }

    // Windows: gdigrab fallback — used when ddagrab is unavailable (Windows 7 or no D3D11).
    // gdigrab copies the framebuffer via GDI which is CPU-bound and can impact game FPS.
    const windowTitle = !useDesktopFallback ? GAME_WINDOW_TITLES[game.toLowerCase()] : undefined

    // When falling back from window-title capture, use the detected window bounds to crop
    // the desktop capture to just the game screen. This prevents recording both monitors
    // side-by-side on dual-monitor setups. If no window info is available, fall back to
    // full desktop as a last resort.
    const monitorOverride = config?.captureMonitor
    const effectiveWindowInfo = typeof monitorOverride === 'number' ? null : windowInfo

    let captureInput: string
    let cropArgs: string[] = []

    if (windowTitle) {
      captureInput = `title=${windowTitle}`
    } else if (effectiveWindowInfo && effectiveWindowInfo.width > 400 && effectiveWindowInfo.height > 300) {
      // Crop gdigrab to just the game window area — avoids multi-monitor bleed
      captureInput = 'desktop'
      cropArgs = [
        '-offset_x', String(Math.max(0, effectiveWindowInfo.x)),
        '-offset_y', String(Math.max(0, effectiveWindowInfo.y)),
        '-video_size', `${effectiveWindowInfo.width}x${effectiveWindowInfo.height}`,
      ]
      console.log(`[Recorder] gdigrab desktop crop: ${effectiveWindowInfo.width}x${effectiveWindowInfo.height} at ${effectiveWindowInfo.x},${effectiveWindowInfo.y}`)
    } else {
      captureInput = 'desktop'
      console.warn('[Recorder] gdigrab full desktop capture (no window bounds available) — may capture multiple monitors')
    }

    console.log(`[Recorder] Windows capture input: ${captureInput}${noAudio ? ' (no audio)' : ''}`)

    // -draw_mouse 0: skip cursor rendering, minor CPU saving
    // -thread_queue_size: reduce input buffering stalls between gdigrab and WASAPI
    // cropArgs must come BEFORE -i desktop for gdigrab to respect them
    const captureArgs = [
      '-f', 'gdigrab',
      '-framerate', '30',
      '-draw_mouse', '0',
      '-thread_queue_size', '512',
      ...cropArgs,
      '-i', captureInput,
    ]

    if (noAudio) {
      return [
        ...captureArgs,
        '-vf', `scale=${scale}`,
        '-vcodec', codec,
        ...qualityArgs,
        '-movflags', '+faststart',
        outputPath
      ]
    }

    return [
      ...captureArgs,
      '-f', 'wasapi',
      '-thread_queue_size', '512',
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


  /**
   * Detect which monitor Valorant is running on by querying the process window bounds via PowerShell.
   * Returns position, size, and monitor index (0-based) for use with ddagrab output_idx and gdigrab cropping.
   * Returns null if detection fails (game not running yet, permission error, etc.).
   */
  private _getValorantWindowInfo(): Promise<WindowInfo | null> {
    if (!IS_WIN) return Promise.resolve(null)
    const { exec } = require('child_process')

    // PowerShell script: find VALORANT process → get window rect → determine which Screen it's on
    const script = [
      'Add-Type -AssemblyName System.Windows.Forms;',
      'Add-Type -TypeDefinition \'using System; using System.Runtime.InteropServices;',
      'public class W32 {',
      '  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);',
      '  public struct RECT { public int L, T, R, B; }',
      '}\';',
      '$proc = Get-Process -Name "VALORANT-Win64-Shipping" -ErrorAction SilentlyContinue;',
      'if (!$proc) { $proc = Get-Process -Name "VALORANT" -ErrorAction SilentlyContinue };',
      'if (!$proc -or $proc.MainWindowHandle -eq 0) { Write-Output "null"; exit 0 };',
      '$r = New-Object W32+RECT;',
      '[W32]::GetWindowRect($proc.MainWindowHandle, [ref]$r) | Out-Null;',
      '$w = $r.R - $r.L; $h = $r.B - $r.T;',
      'if ($w -lt 400 -or $h -lt 300) { Write-Output "null"; exit 0 };',
      '$cx = $r.L + $w / 2; $cy = $r.T + $h / 2;',
      '$screens = [System.Windows.Forms.Screen]::AllScreens;',
      '$idx = 0;',
      'for ($i = 0; $i -lt $screens.Length; $i++) {',
      '  $b = $screens[$i].Bounds;',
      '  if ($cx -ge $b.X -and $cx -lt ($b.X + $b.Width) -and $cy -ge $b.Y -and $cy -lt ($b.Y + $b.Height)) { $idx = $i; break }',
      '};',
      'Write-Output "$($r.L),$($r.T),$w,$h,$idx"',
    ].join(' ')

    return new Promise((resolve) => {
      exec(
        `powershell -NoProfile -NonInteractive -Command "${script}"`,
        { windowsHide: true, timeout: 5000 },
        (err: Error | null, stdout: string) => {
          if (err || stdout.trim() === 'null' || !stdout.trim()) {
            resolve(null)
            return
          }
          const parts = stdout.trim().split(',').map(Number)
          if (parts.length === 5 && parts.every(n => !isNaN(n) && isFinite(n))) {
            const [x, y, width, height, monitorIndex] = parts
            resolve({ x, y, width, height, monitorIndex })
          } else {
            resolve(null)
          }
        }
      )
    })
  }

  /** Lower the priority of a Windows process to BelowNormal so it doesn't compete with the game. */
  private _lowerProcessPriority(pid: number): void {
    // PowerShell: set process priority to BelowNormal (value 16384)
    const { exec } = require('child_process')
    exec(
      `powershell -NoProfile -NonInteractive -Command "(Get-Process -Id ${pid}).PriorityClass = 'BelowNormal'"`,
      { windowsHide: true },
      (err: Error | null) => {
        if (err) console.warn('[Recorder] Could not lower ffmpeg priority:', err.message)
        else console.log(`[Recorder] ffmpeg (pid ${pid}) set to BelowNormal priority`)
      }
    )
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
