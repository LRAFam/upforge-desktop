/**
 * Re-encode oversized OBS recordings to the coaching preset before upload.
 * OBS profile parameters often do not apply (especially Advanced Output mode).
 */

import { spawn } from 'child_process'
import { dirname, join, basename } from 'path'
import { existsSync, mkdirSync, statSync, unlinkSync } from 'fs'
import { is } from '@electron-toolkit/utils'
import log from 'electron-log'
import { UPLOAD_COMPRESSION_PRESET } from './recording-preset'
import { registerVodCompressionProc } from './match-priority-guard'

const IS_WIN = process.platform === 'win32'

function ffmpegBin(): string {
  if (is.dev) return IS_WIN ? 'ffmpeg.exe' : 'ffmpeg'
  return join(process.resourcesPath, 'ffmpeg', IS_WIN ? 'ffmpeg.exe' : 'ffmpeg')
}

export function compressedPathFor(sourcePath: string): string {
  const dir = dirname(sourcePath)
  const stem = basename(sourcePath, '.mp4')
  return join(dir, `${stem}_upforge.mp4`)
}

/** Inverse of compressedPathFor — null if not an UpForge-compressed export. */
export function sourcePathForCompressed(compressedPath: string): string | null {
  const stem = basename(compressedPath, '.mp4')
  if (!stem.endsWith('_upforge')) return null
  return join(dirname(compressedPath), `${stem.slice(0, -'_upforge'.length)}.mp4`)
}

/** Raw + compressed paths for the same match recording. */
export function recordingPathVariants(filePath: string): string[] {
  const variants = new Set<string>([filePath])
  variants.add(compressedPathFor(filePath))
  const source = sourcePathForCompressed(filePath)
  if (source) variants.add(source)
  return [...variants]
}

/** Archive / cloud-save — compress only when clearly oversized. */
export const COMPRESS_IF_LARGER_THAN_BYTES = Math.round(1.5 * 1024 * 1024 * 1024)

/** Analysis upload — re-encode sooner; smaller files beat slow home uplink. */
export const ANALYSIS_COMPRESS_IF_LARGER_THAN_BYTES = Math.round(0.4 * 1024 * 1024 * 1024)

export function shouldCompressVod(sizeBytes: number, forAnalysis = false): boolean {
  const threshold = forAnalysis ? ANALYSIS_COMPRESS_IF_LARGER_THAN_BYTES : COMPRESS_IF_LARGER_THAN_BYTES
  return sizeBytes > threshold
}

/** OBS often records `.mkv` — S3 keys are `.mp4`, so transcode before cloud upload. */
export function needsTranscodeForCloudUpload(sourcePath: string): boolean {
  const normalized = sourcePath.replace(/\\/g, '/')
  return !/\.(mp4|webm|m4v|mov)$/i.test(normalized)
}

export interface CompressVodResult {
  ok: boolean
  outputPath: string
  outputSizeBytes: number
  error?: string
}

export interface ResolveUploadVideoPathOptions {
  /** Re-encode to coaching preset above {@link ANALYSIS_COMPRESS_IF_LARGER_THAN_BYTES}. */
  forAnalysis?: boolean
}

export async function resolveUploadVideoPath(
  sourcePath: string,
  onCompressStart?: (sizeGB: string) => void,
  options?: ResolveUploadVideoPathOptions,
): Promise<{ path: string; sizeBytes: number; compressed: boolean }> {
  const forAnalysis = options?.forAnalysis === true
  if (!existsSync(sourcePath)) {
    throw new Error(`Recording file not found: ${sourcePath}`)
  }

  let sizeBytes = statSync(sourcePath).size
  const sibling = compressedPathFor(sourcePath)
  if (existsSync(sibling)) {
    const siblingSize = statSync(sibling).size
    if (statSync(sibling).mtimeMs >= statSync(sourcePath).mtimeMs && siblingSize < sizeBytes) {
      return { path: sibling, sizeBytes: siblingSize, compressed: true }
    }
  }

  const mustTranscode = needsTranscodeForCloudUpload(sourcePath)
  if (!shouldCompressVod(sizeBytes, forAnalysis) && !mustTranscode) {
    return { path: sourcePath, sizeBytes, compressed: false }
  }

  onCompressStart?.(mustTranscode && !shouldCompressVod(sizeBytes, forAnalysis)
    ? 'transcode'
    : (sizeBytes / (1024 ** 3)).toFixed(1))
  const result = await compressVodForUpload(sourcePath)
  if (result.ok) {
    return { path: result.outputPath, sizeBytes: result.outputSizeBytes, compressed: true }
  }

  return { path: sourcePath, sizeBytes, compressed: false }
}

export async function compressVodForUpload(sourcePath: string): Promise<CompressVodResult> {
  const outputPath = compressedPathFor(sourcePath)
  mkdirSync(dirname(outputPath), { recursive: true })

  if (existsSync(outputPath)) {
    try { unlinkSync(outputPath) } catch { /* ignore */ }
  }

  const scale = UPLOAD_COMPRESSION_PRESET.quality === '1080p' ? '1920:1080' : '1280:720'
  const bitrate = `${UPLOAD_COMPRESSION_PRESET.bitrate}M`
  const maxrate = `${Math.round(UPLOAD_COMPRESSION_PRESET.bitrate * 1.1)}M`
  const bufsize = `${UPLOAD_COMPRESSION_PRESET.bitrate * 2}M`
  const fps = UPLOAD_COMPRESSION_PRESET.fps

  const videoFilters = `scale=${scale}:force_original_aspect_ratio=decrease,pad=${scale}:(ow-iw)/2:(oh-ih)/2,fps=${fps}`

  // CPU-only — OBS uses NVENC/AMF during matches; hardware encoders here cause stutter.
  const encoders = IS_WIN
    ? ['libx264']
    : [process.platform === 'darwin' ? 'h264_videotoolbox' : 'libx264']

  let lastError = 'Compression failed'
  for (const encoder of encoders) {
    const videoArgs = encoder === 'libx264'
      ? ['-c:v', encoder, '-preset', 'veryfast', '-crf', '23', '-threads', '2']
      : ['-c:v', encoder, '-b:v', bitrate, '-maxrate', maxrate, '-bufsize', bufsize]

    try {
      log.info(`[VodCompressor] Compressing with ${encoder}: ${sourcePath}`)
      await runFfmpeg([
        '-y',
        '-i', sourcePath,
        '-map', '0:v:0',
        '-map', '0:a:0?',
        '-vf', videoFilters,
        ...videoArgs,
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        outputPath,
      ])
      const outputSizeBytes = statSync(outputPath).size
      log.info(
        `[VodCompressor] Done: ${(statSync(sourcePath).size / (1024 ** 3)).toFixed(2)} GB → ` +
        `${(outputSizeBytes / (1024 ** 3)).toFixed(2)} GB`,
      )
      return { ok: true, outputPath, outputSizeBytes }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
      log.warn(`[VodCompressor] ${encoder} failed:`, lastError)
      if (existsSync(outputPath)) {
        try { unlinkSync(outputPath) } catch { /* ignore */ }
      }
    }
  }

  return { ok: false, outputPath, outputSizeBytes: 0, error: lastError }
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegBin(), args, { stdio: ['ignore', 'ignore', 'pipe'] })
    registerVodCompressionProc(proc)
    let stderr = ''
    let settled = false
    const timeoutMs = 90 * 60 * 1000
    const timer = setTimeout(() => {
      proc.kill('SIGKILL')
      settle(() => reject(new Error('Compression timed out after 90 minutes')))
    }, timeoutMs)

    const settle = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      registerVodCompressionProc(null)
      fn()
    }

    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString() })
    proc.on('error', (err) => settle(() => reject(err)))
    proc.on('exit', (code, signal) => {
      if (code === 0) settle(() => resolve())
      else if (signal === 'SIGKILL') settle(() => reject(new Error('Compression cancelled — match in progress')))
      else settle(() => reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-400)}`)))
    })

    if (proc.pid) {
      const { exec } = require('child_process') as typeof import('child_process')
      if (IS_WIN) {
        exec(
          `powershell -NoProfile -NonInteractive -Command "(Get-Process -Id ${proc.pid}).PriorityClass = 'Idle'"`,
          { windowsHide: true },
          () => {},
        )
      } else {
        exec(`renice -n 15 -p ${proc.pid}`, () => {})
      }
    }
  })
}

export function deleteCompressedSibling(sourcePath: string): void {
  const compressed = compressedPathFor(sourcePath)
  if (existsSync(compressed)) {
    try { unlinkSync(compressed) } catch { /* ignore */ }
  }
}

/** Delete a recording and any raw/compressed siblings. Returns bytes freed. */
export function deleteLocalRecordingFiles(filePath: string): number {
  let freed = 0
  for (const variant of recordingPathVariants(filePath)) {
    try {
      if (existsSync(variant)) {
        freed += statSync(variant).size
        unlinkSync(variant)
      }
    } catch { /* ignore */ }
  }
  return freed
}
