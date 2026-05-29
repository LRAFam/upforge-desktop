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

    // Always transcode to H.264/AAC for maximum player compatibility.
    // Our source recordings are VP9-in-MP4 (remuxed from WebM) or raw WebM — neither
    // streams-copies cleanly into MP4 on all platforms. For short clips (8–30s),
    // veryfast H.264 transcoding is near-instant. Optional audio map handles
    // recordings where audio capture was unavailable.
    try {
      await this._run(
        [
          '-y',
          '-ss', String(startSec),
          '-i', opts.sourcePath,
          '-t', String(durSec),
          '-map', '0:v:0',
          '-map', '0:a:0?',
          '-c:v', 'libx264', '-crf', '22', '-preset', 'veryfast', '-threads', '2', '-pix_fmt', 'yuv420p',
          '-c:a', 'aac', '-b:a', '128k',
          '-avoid_negative_ts', '1',
          '-movflags', '+faststart',
          opts.outputPath,
        ],
        120_000,
      )
    } catch (err) {
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
      '-map', '0:v:0',
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
      const IS_WIN = process.platform === 'win32'
      const IS_MAC = process.platform === 'darwin'
      const proc = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] })
      let stderr = ''
      let settled = false
      const settle = (fn: () => void) => { if (!settled) { settled = true; clearTimeout(timer); fn() } }

      proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString() })
      proc.on('error', (err) => settle(() => reject(new Error(`ffmpeg error: ${err.message}`))))
      proc.on('exit', (code) => {
        if (code === 0) settle(() => resolve())
        else settle(() => reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-300)}`)))
      })

      // Lower process priority so clip extraction doesn't compete with the game or system.
      if (proc.pid) {
        if (IS_WIN) {
          const { exec } = require('child_process') as typeof import('child_process')
          exec(
            `powershell -NoProfile -NonInteractive -Command "(Get-Process -Id ${proc.pid}).PriorityClass = 'BelowNormal'"`,
            { windowsHide: true },
            (err) => { if (err) console.warn('[ClipExtractor] Could not lower ffmpeg priority:', err.message) },
          )
        } else if (IS_MAC || process.platform === 'linux') {
          const { exec } = require('child_process') as typeof import('child_process')
          exec(`renice -n 10 -p ${proc.pid}`, (err) => {
            if (err) console.warn('[ClipExtractor] Could not renice ffmpeg:', err.message)
          })
        }
      }

      // Hard cap — clips should never take this long
      const timer = setTimeout(() => { proc.kill(); settle(() => reject(new Error('ffmpeg timed out'))) }, timeoutMs)
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
