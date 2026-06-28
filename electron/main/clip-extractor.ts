import { spawn } from 'child_process'
import { join, dirname } from 'path'
import fs from 'fs'
import { app } from 'electron'
import { existsSync, mkdirSync } from 'fs'
import { is } from '@electron-toolkit/utils'
import log from 'electron-log'

const IS_WIN = process.platform === 'win32'

/** Max cloud upload height for free-tier clip shares. */
export const FREE_CLIP_UPLOAD_MAX_HEIGHT = 720

let clipsMediaDirOverride: string | null = null

export function setClipsMediaDir(dir: string | null): void {
  clipsMediaDirOverride = dir
}

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
  /**
   * Frame-accurate seek (decode-then-trim). Slower on long VODs but required for
   * duel windows where death timestamps must land inside the clip.
   */
  accurateSeek?: boolean
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

    const inputArgs = opts.accurateSeek
      ? ['-i', opts.sourcePath, '-ss', String(startSec)]
      : ['-ss', String(startSec), '-i', opts.sourcePath]

    // Always transcode to H.264/AAC for maximum player compatibility.
    // Our source recordings are VP9-in-MP4 (remuxed from WebM) or raw WebM — neither
    // streams-copies cleanly into MP4 on all platforms. For short clips (8–30s),
    // veryfast H.264 transcoding is near-instant. Optional audio map handles
    // recordings where audio capture was unavailable.
    try {
      await this._run(
        [
          '-y',
          ...inputArgs,
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

  /** Trim a full match VOD — stream-copy first, H.264 transcode fallback for OBS codecs. */
  async trimVod(opts: TrimOptions): Promise<void> {
    mkdirSync(dirname(opts.outputPath), { recursive: true })
    const dur = opts.endSec - opts.startSec
    if (dur <= 0) throw new Error('Trim end must be after start')
    try {
      await this.trim({ ...opts })
    } catch (copyErr) {
      try { if (fs.existsSync(opts.outputPath)) fs.unlinkSync(opts.outputPath) } catch { /* ignore */ }
      log.warn('[ClipExtractor] VOD trim stream-copy failed, transcoding:', copyErr)
      await this._run([
        '-y',
        '-ss', String(opts.startSec),
        '-i', opts.sourcePath,
        '-t', String(dur),
        '-map', '0:v:0',
        '-map', '0:a:0?',
        '-c:v', 'libx264', '-crf', '22', '-preset', 'veryfast', '-threads', '2', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '128k',
        '-avoid_negative_ts', '1',
        '-movflags', '+faststart',
        opts.outputPath,
      ], 20 * 60_000)
    }
  }

  /** Read video dimensions from container metadata (ffmpeg stderr). */
  async probeDimensions(filePath: string): Promise<{ width: number; height: number } | null> {
    return new Promise((resolve) => {
      const proc = spawn(ffmpegPath(), ['-i', filePath], { stdio: ['ignore', 'ignore', 'pipe'] })
      let stderr = ''
      proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString() })
      proc.on('close', () => {
        const match = stderr.match(/,\s*(\d{2,5})x(\d{2,5})(?:\s|,|\[)/)
        if (match) {
          resolve({ width: parseInt(match[1], 10), height: parseInt(match[2], 10) })
        } else {
          resolve(null)
        }
      })
      proc.on('error', () => resolve(null))
    })
  }

  /**
   * Downscale a clip to coaching resolution for free-tier cloud upload.
   * Local files stay at full resolution — only the upload copy is capped.
   */
  async transcodeForCloudUpload(sourcePath: string, outputPath: string): Promise<void> {
    mkdirSync(dirname(outputPath), { recursive: true })
    const scale = '1280:720'
    const videoFilters = `scale=${scale}:force_original_aspect_ratio=decrease,pad=${scale}:(ow-iw)/2:(oh-ih)/2`
    try {
      await this._run([
        '-y',
        '-i', sourcePath,
        '-map', '0:v:0',
        '-map', '0:a:0?',
        '-vf', videoFilters,
        '-c:v', 'libx264', '-crf', '22', '-preset', 'veryfast', '-threads', '2', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '128k',
        '-avoid_negative_ts', '1',
        '-movflags', '+faststart',
        outputPath,
      ], 120_000)
    } catch (err) {
      try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath) } catch { /* ignore */ }
      throw err
    }
  }

  /**
   * Quickly probe a source file to check it is a valid, readable MP4.
   * Returns ok:false (with a reason) when the moov atom is missing, which
   * happens when ffmpeg was SIGKILL'd or crashed before finalising the file.
   * Call this before attempting extraction to surface one clear error rather
   * than one error per clip type.
   */
  async probe(filePath: string): Promise<{ ok: boolean; reason?: string }> {
    try {
      // Read only 1 video frame — fails immediately if the container is unreadable.
      await this._run(['-v', 'error', '-i', filePath, '-frames:v', '1', '-f', 'null', '-'], 10_000)
      return { ok: true }
    } catch (err) {
      const msg = String(err)
      if (msg.includes('moov atom not found') || msg.includes('Invalid data')) {
        return { ok: false, reason: 'Recording is incomplete — moov atom not found. ffmpeg likely exited before finalising the file.' }
      }
      return { ok: false, reason: msg.slice(0, 200) }
    }
  }

  /** Container duration in milliseconds (null when ffmpeg cannot parse it). */
  async probeDurationMs(filePath: string): Promise<number | null> {
    return new Promise((resolve) => {
      const proc = spawn(ffmpegPath(), ['-i', filePath], { stdio: ['ignore', 'ignore', 'pipe'] })
      let stderr = ''
      proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString() })
      proc.on('close', () => {
        const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
        if (!match) {
          resolve(null)
          return
        }
        const hours = parseInt(match[1], 10)
        const minutes = parseInt(match[2], 10)
        const seconds = parseFloat(match[3])
        resolve(Math.round((hours * 3600 + minutes * 60 + seconds) * 1000))
      })
      proc.on('error', () => resolve(null))
    })
  }

  /** Concatenate multiple H.264 MP4 segments into one recap file. */
  async concat(segmentPaths: string[], outputPath: string): Promise<void> {
    if (segmentPaths.length === 0) {
      throw new Error('No segments to concat')
    }
    mkdirSync(dirname(outputPath), { recursive: true })

    if (segmentPaths.length === 1) {
      fs.copyFileSync(segmentPaths[0], outputPath)
      return
    }

    const listPath = outputPath.replace(/\.mp4$/i, '_concat_list.txt')
    const listBody = segmentPaths
      .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
      .join('\n')
    fs.writeFileSync(listPath, listBody, 'utf8')

    try {
      await this._run([
        '-y',
        '-f', 'concat',
        '-safe', '0',
        '-i', listPath,
        '-c', 'copy',
        '-movflags', '+faststart',
        outputPath,
      ], 180_000)
    } catch (err) {
      try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath) } catch { /* ignore */ }
      throw err
    } finally {
      try { fs.unlinkSync(listPath) } catch { /* ignore */ }
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

  /** Clips media directory — per-user when scoped, else legacy global path. */
  static clipsDir(): string {
    return clipsMediaDirOverride ?? join(app.getPath('userData'), 'clips')
  }

  /** Build output path for a clip given a unique id */
  static clipPath(id: string): string {
    return join(ClipExtractor.clipsDir(), `${id}.mp4`)
  }

  /** Build thumbnail path for a clip */
  static thumbPath(id: string): string {
    return join(ClipExtractor.clipsDir(), `${id}_thumb.jpg`)
  }

  /** Directory for scout gap thumbnails (not full clips). */
  scoutThumbDir(): string {
    const dir = join(ClipExtractor.clipsDir(), 'scout-thumbs')
    mkdirSync(dir, { recursive: true })
    return dir
  }
}
