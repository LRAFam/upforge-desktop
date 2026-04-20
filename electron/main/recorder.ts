import { spawn, ChildProcess } from 'child_process'
import { join } from 'path'
import { app } from 'electron'
import { existsSync, mkdirSync, unlinkSync } from 'fs'
import { is } from '@electron-toolkit/utils'

type HWEncoder = 'videotoolbox' | 'nvenc' | 'amf' | 'qsv' | 'software'

const IS_MAC = process.platform === 'darwin'
const IS_WIN = process.platform === 'win32'

export class Recorder {
  private _process: ChildProcess | null = null
  private _outputPath: string | null = null
  private _recording = false

  isRecording(): boolean {
    return this._recording
  }

  async start(game: string): Promise<void> {
    if (this._recording) {
      console.warn('[Recorder] Already recording, ignoring start()')
      return
    }

    const dir = join(app.getPath('userData'), 'recordings')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

    const timestamp = Date.now()
    this._outputPath = join(dir, `${game}_${timestamp}.mp4`)

    const encoder = await this._detectEncoder()
    const ffmpegPath = this._ffmpegPath()
    const args = this._buildArgs(encoder, this._outputPath)

    console.log(`[Recorder] Platform: ${process.platform}, encoder: ${encoder}`)
    console.log(`[Recorder] Output: ${this._outputPath}`)

    this._process = spawn(ffmpegPath, args, { stdio: 'pipe' })
    this._recording = true

    this._process.on('error', (err) => {
      console.error('[Recorder] ffmpeg error:', err)
      this._recording = false
    })

    this._process.on('exit', (code) => {
      console.log(`[Recorder] ffmpeg exited with code ${code}`)
      this._recording = false
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

  private _buildArgs(encoder: HWEncoder, outputPath: string): string[] {
    const codecMap: Record<HWEncoder, string> = {
      videotoolbox: 'h264_videotoolbox',
      nvenc: 'h264_nvenc',
      amf: 'h264_amf',
      qsv: 'h264_qsv',
      software: 'libx264'
    }

    const codec = codecMap[encoder]
    const qualityArgs = encoder === 'software'
      ? ['-crf', '28', '-preset', 'veryfast']
      : encoder === 'videotoolbox'
        ? ['-b:v', '4M']
        : ['-b:v', '4M', '-maxrate', '6M', '-bufsize', '8M']

    if (IS_MAC) {
      return [
        '-f', 'avfoundation',
        '-framerate', '30',
        '-i', '1:0',          // screen 1, default audio
        '-vf', 'scale=1280:720',
        '-vcodec', codec,
        ...qualityArgs,
        '-acodec', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        outputPath
      ]
    }

    // Windows
    return [
      '-f', 'gdigrab',
      '-framerate', '30',
      '-i', 'desktop',
      '-vf', 'scale=1280:720',
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
