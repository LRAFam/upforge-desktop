import { spawn } from 'child_process'
import { join, dirname } from 'path'
import fs from 'fs'
import { app } from 'electron'
import { existsSync, mkdirSync } from 'fs'
import { is } from '@electron-toolkit/utils'

const IS_WIN = process.platform === 'win32'

function ffmpegPath(): string {
  if (is.dev) return IS_WIN ? 'ffmpeg.exe' : 'ffmpeg'
  return join(process.resourcesPath, 'ffmpeg', IS_WIN ? 'ffmpeg.exe' : 'ffmpeg')
}

export interface ExtractOptions {
  /** Path to the source recording */
  sourcePath: string
  /** Offset into the source recording where the clip starts (milliseconds) */
  startOffsetMs: number
  /** Duration of the clip to extract (milliseconds) */
  durationMs: number
  /** Output file path (mp4) */
  outputPath: string
}

export interface ThumbnailOptions {
  sourcePath: string
  /** Offset into the source recording for the thumbnail frame (ms) */
  offsetMs: number
  outputPath: string
}

export interface TrimOptions {
  sourcePath: string
  /** Trim start offset in seconds */
  startSec: number
  /** Trim end offset in seconds */
  endSec: number
  outputPath: string
}

export class ClipExtractor {
  /** Extract a clip from a source recording using FFmpeg seek + trim. */
  async extract(opts: ExtractOptions): Promise<void> {
    mkdirSync(dirname(opts.outputPath), { recursive: true })

    const startSec = Math.max(0, opts.startOffsetMs / 1000)
    const durSec = opts.durationMs / 1000

    try {
      await this._run([
        '-y',
        '-ss', String(startSec),
        '-i', opts.sourcePath,
        '-t', String(durSec),
        '-c:v', 'copy',
        '-c:a', 'copy',
        '-avoid_negative_ts', '1',
        '-movflags', '+faststart',
        opts.outputPath,
      ])
    } catch (err) {
      // Clean up partial output on failure
      try { if (fs.existsSync(opts.outputPath)) fs.unlinkSync(opts.outputPath) } catch { /* ignore */ }
      throw err
    }
  }

  /** Extract a single JPEG thumbnail frame from a source recording. */
  async thumbnail(opts: ThumbnailOptions): Promise<void> {
    mkdirSync(dirname(opts.outputPath), { recursive: true })

    const offsetSec = Math.max(0, opts.offsetMs / 1000)

    await this._run([
      '-y',
      '-ss', String(offsetSec),
      '-i', opts.sourcePath,
      '-vframes', '1',
      '-q:v', '3',
      opts.outputPath,
    ], 30_000)
  }

  /** Trim a clip to a new start/end window in-place (writes to outputPath). */
  async trim(opts: TrimOptions): Promise<void> {
    mkdirSync(dirname(opts.outputPath), { recursive: true })
    const dur = opts.endSec - opts.startSec
    if (dur <= 0) throw new Error('Trim end must be after start')
    try {
      await this._run([
        '-y',
        '-ss', String(opts.startSec),
        '-i', opts.sourcePath,
        '-t', String(dur),
        '-c:v', 'copy',
        '-c:a', 'copy',
        '-avoid_negative_ts', '1',
        '-movflags', '+faststart',
        opts.outputPath,
      ])
    } catch (err) {
      try { if (fs.existsSync(opts.outputPath)) fs.unlinkSync(opts.outputPath) } catch { /* ignore */ }
      throw err
    }
  }

  private _run(args: string[], timeoutMs = 60_000): Promise<void> {
    return new Promise((resolve, reject) => {
      const bin = ffmpegPath()
      const proc = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] })
      let stderr = ''
      proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString() })
      proc.on('error', (err) => reject(new Error(`ffmpeg error: ${err.message}`)))
      proc.on('exit', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-300)}`))
      })
      // Hard cap — clips should never take this long
      setTimeout(() => { proc.kill(); reject(new Error('ffmpeg timed out')) }, timeoutMs)
    })
  }

  /** Default clips directory inside userData */
  static clipsDir(): string {
    return join(app.getPath('userData'), 'clips')
  }

  /** Build output path for a clip given a unique id */
  static clipPath(id: string): string {
    return join(ClipExtractor.clipsDir(), `${id}.mp4`)
  }

  /** Build thumbnail path for a clip */
  static thumbPath(id: string): string {
    return join(ClipExtractor.clipsDir(), `${id}_thumb.jpg`)
  }
}
