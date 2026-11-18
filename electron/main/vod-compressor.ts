import { backgroundWork, BackgroundWorkCancelledError } from './background-work'
/**
 * Re-encode oversized OBS recordings to the coaching preset before upload.
 * OBS profile parameters often do not apply (especially Advanced Output mode).
 */

import { spawn } from 'child_process'
import { dirname, join, basename } from 'path'
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'fs'
import { is } from '@electron-toolkit/utils'
import log from 'electron-log'
import { UPLOAD_COMPRESSION_PRESET } from './recording-preset'
import { registerVodCompressionProc } from './match-priority-guard'
import { FfmpegProgressParser } from './ffmpeg-progress'
import { redactSensitiveString } from './error-redaction'

const IS_WIN = process.platform === 'win32'

function ffmpegBin(): string {
  if (is.dev) return IS_WIN ? 'ffmpeg.exe' : 'ffmpeg'
  return join(process.resourcesPath, 'ffmpeg', IS_WIN ? 'ffmpeg.exe' : 'ffmpeg')
}

export function compressedPathFor(sourcePath: string): string {
  const dir = dirname(sourcePath)
  const base = basename(sourcePath)
  const stem = base.replace(/\.(mp4|mkv|webm|mov|m4v|flv)$/i, '')
  return join(dir, `${stem}_upforge.mp4`)
}

/** Inverse of compressedPathFor — null if not an UpForge-compressed export. */
export function sourcePathForCompressed(compressedPath: string): string | null {
  const stem = basename(compressedPath, '.mp4')
  if (!stem.endsWith('_upforge')) return null
  const base = stem.slice(0, -'_upforge'.length)
  const dir = dirname(compressedPath)
  for (const ext of ['.mkv', '.mp4', '.webm', '.mov', '.m4v']) {
    const candidate = join(dir, `${base}${ext}`)
    if (existsSync(candidate)) return candidate
  }
  return join(dir, `${base}.mp4`)
}

/**
 * FFmpeg writes here (forced `-f mp4`); the file is promoted to the real sibling only after a
 * clean exit. The non-video extension keeps recording scans from ever picking it up.
 */
export function partialPathFor(outputPath: string): string {
  return `${outputPath}.partial`
}

/** Sidecar proving that a prepared sibling was fully written from the current source. */
export function preparedMarkerPathFor(outputPath: string): string {
  return `${outputPath}.done`
}

interface PreparedMarker { sourceSize: number; sourceMtimeMs: number; outputSize: number }

function removeQuietly(p: string): void {
  if (existsSync(p)) {
    try { unlinkSync(p) } catch { /* ignore */ }
  }
}

/** Promote a finished FFmpeg output and record which source it was made from. */
function promotePreparedOutput(sourcePath: string, partialPath: string, outputPath: string): number {
  const outputSize = statSync(partialPath).size
  if (outputSize <= 0) throw new Error('Prepared video is empty')
  renameSync(partialPath, outputPath)
  const src = statSync(sourcePath)
  const marker: PreparedMarker = { sourceSize: src.size, sourceMtimeMs: src.mtimeMs, outputSize }
  writeFileSync(preparedMarkerPathFor(outputPath), JSON.stringify(marker))
  return outputSize
}

/**
 * True only when `sibling` was promoted after a clean FFmpeg exit from this exact source.
 * Partial, interrupted, zero-byte or pre-marker siblings are never trusted.
 */
export function isVerifiedPreparedSibling(sourcePath: string, sibling: string): boolean {
  try {
    const marker = JSON.parse(readFileSync(preparedMarkerPathFor(sibling), 'utf8')) as PreparedMarker
    const src = statSync(sourcePath)
    const out = statSync(sibling)
    return out.isFile()
      && out.size > 0
      && out.size === marker.outputSize
      && src.size === marker.sourceSize
      && Math.abs(src.mtimeMs - marker.sourceMtimeMs) < 1
  } catch {
    return false
  }
}

/** Remove any output, in-progress output and completion marker for `outputPath`. */
function clearPreparedOutput(outputPath: string): void {
  removeQuietly(outputPath)
  removeQuietly(partialPathFor(outputPath))
  removeQuietly(preparedMarkerPathFor(outputPath))
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

export class RecordingPreparationError extends Error {
  readonly diagnostics: { stage: 'prepare'; reason: string; detail: string }

  constructor(detail: string, recordingPaths: readonly string[]) {
    const [reason, recovery] = /ENOENT|ffmpeg.*not found/i.test(detail)
      ? ['missing_tool', 'The video tool is missing. Please reinstall UpForge, then try again.']
      : /ENOSPC|no space left/i.test(detail)
        ? ['disk_full', 'Free up disk space on the recording drive, then try again.']
        : /EACCES|EPERM|permission denied/i.test(detail)
          ? ['permission', 'Check write permission for your recording folder, then try again.']
          : /timed out|timeout/i.test(detail)
            ? ['timeout', 'Video preparation timed out. Close other video apps, then try again.']
            : ['encoder', 'Close other video apps, then try again.']
    // Recordings may live on external disks or NAS shares, outside standard user
    // directories. Remove known input/output paths before attaching FFmpeg output.
    let safeDetail = detail
    const paths = new Set<string>()
    for (const recordingPath of recordingPaths) {
      const normalized = recordingPath.replace(/\\/g, '/')
      const folder = normalized.slice(0, normalized.lastIndexOf('/'))
      paths.add(recordingPath)
      paths.add(normalized)
      paths.add(normalized.replace(/\//g, '\\'))
      if (folder.length > 3) {
        paths.add(folder)
        paths.add(folder.replace(/\//g, '\\'))
      }
    }
    for (const knownPath of [...paths].sort((a, b) => b.length - a.length)) {
      if (!knownPath) continue
      const escaped = knownPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      safeDetail = safeDetail.replace(new RegExp(escaped, /^[A-Za-z]:|^[/\\]{2}/.test(knownPath) ? 'gi' : 'g'), '[redacted-path]')
    }
    safeDetail = redactSensitiveString(safeDetail).slice(-1000)
    super(`Could not prepare recording for upload. ${recovery} Your original recording is still saved.`, { cause: new Error(safeDetail) })
    this.name = 'RecordingPreparationError'
    this.diagnostics = { stage: 'prepare', reason, detail: safeDetail }
  }
}

export interface ResolveUploadVideoPathOptions {
  /** Re-encode to coaching preset above {@link ANALYSIS_COMPRESS_IF_LARGER_THAN_BYTES}. */
  forAnalysis?: boolean
  /** Reports progress while FFmpeg prepares the recording. */
  onProgress?: (percent: number) => void
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

  const sizeBytes = statSync(sourcePath).size
  const sibling = compressedPathFor(sourcePath)
  if (existsSync(sibling) && sibling !== sourcePath) {
    const siblingSize = statSync(sibling).size
    if (isVerifiedPreparedSibling(sourcePath, sibling) && siblingSize < sizeBytes) {
      return { path: sibling, sizeBytes: siblingSize, compressed: true }
    }
  }

  const mustTranscode = needsTranscodeForCloudUpload(sourcePath)
  if (!shouldCompressVod(sizeBytes, forAnalysis) && !mustTranscode) {
    return { path: sourcePath, sizeBytes, compressed: false }
  }

  // MKV/MOV → MP4 via stream copy when codecs are already browser/S3 compatible (seconds, not minutes).
  if (mustTranscode && !shouldCompressVod(sizeBytes, forAnalysis)) {
    onCompressStart?.('remux')
    const remuxed = await remuxVodForUpload(sourcePath, options?.onProgress)
    if (remuxed.ok) {
      return { path: remuxed.outputPath, sizeBytes: remuxed.outputSizeBytes, compressed: true }
    }
    if (/moov atom|invalid data/i.test(remuxed.error ?? '')) {
      throw new Error('Recording file is incomplete — OBS may have stopped before the file finished saving.')
    }
    log.warn('[VodCompressor] Remux failed, falling back to full transcode:', remuxed.error)
  }

  onCompressStart?.(mustTranscode && !shouldCompressVod(sizeBytes, forAnalysis)
    ? 'transcode'
    : (sizeBytes / (1024 ** 3)).toFixed(1))

  // Transcode straight from the source (MKV included): the output is its one `_upforge.mp4`
  // sibling. Remuxing first made the remux the input and left `foo_upforge_upforge.mp4` behind.
  const result = await compressVodForUpload(sourcePath, options?.onProgress)
  if (result.ok) {
    return { path: result.outputPath, sizeBytes: result.outputSizeBytes, compressed: true }
  }

  if (mustTranscode || shouldCompressVod(sizeBytes, forAnalysis)) {
    const detail = result.error ?? ''
    if (/compression cancelled/i.test(detail)) {
      throw new Error(detail)
    }
    if (/moov atom|invalid data/i.test(detail)) {
      throw new Error('Recording file is incomplete — OBS may have stopped before the file finished saving.')
    }
    throw new RecordingPreparationError(detail, [sourcePath, result.outputPath])
  }

  return { path: sourcePath, sizeBytes, compressed: false }
}

export async function remuxVodForUpload(
  sourcePath: string,
  onProgress?: (percent: number) => void,
): Promise<CompressVodResult> {
  const outputPath = compressedPathFor(sourcePath)
  const partialPath = partialPathFor(outputPath)
  mkdirSync(dirname(outputPath), { recursive: true })
  clearPreparedOutput(outputPath)

  try {
    log.info(`[VodCompressor] Remux (stream copy): ${sourcePath}`)
    await runFfmpeg([
      '-y',
      '-i', sourcePath,
      '-map', '0:v:0',
      '-map', '0:a:0?',
      '-c', 'copy',
      '-movflags', '+faststart',
      '-f', 'mp4',
      partialPath,
    ], onProgress)
    const outputSizeBytes = promotePreparedOutput(sourcePath, partialPath, outputPath)
    return { ok: true, outputPath, outputSizeBytes }
  } catch (err) {
    // Cancelled or failed: never leave an incomplete file where the next save would find it.
    clearPreparedOutput(outputPath)
    if (err instanceof BackgroundWorkCancelledError) throw err
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, outputPath, outputSizeBytes: 0, error: msg }
  }
}

export async function compressVodForUpload(
  sourcePath: string,
  onProgress?: (percent: number) => void,
): Promise<CompressVodResult> {
  const outputPath = compressedPathFor(sourcePath)
  const partialPath = partialPathFor(outputPath)
  mkdirSync(dirname(outputPath), { recursive: true })
  clearPreparedOutput(outputPath)

  const scale = UPLOAD_COMPRESSION_PRESET.quality === '1080p' ? '1920:1080' : '1280:720'
  const bitrate = `${UPLOAD_COMPRESSION_PRESET.bitrate}M`
  const maxrate = `${Math.round(UPLOAD_COMPRESSION_PRESET.bitrate * 1.1)}M`
  const bufsize = `${UPLOAD_COMPRESSION_PRESET.bitrate * 2}M`
  const fps = UPLOAD_COMPRESSION_PRESET.fps

  const videoFilters = `scale=${scale}:force_original_aspect_ratio=decrease,pad=${scale}:(ow-iw)/2:(oh-ih)/2,fps=${fps}`

  // Post-match only — use GPU encoders when available (5–10× faster than libx264 at 2 threads).
  const encoders = IS_WIN
    ? ['h264_nvenc', 'h264_amf', 'h264_qsv', 'libx264']
    : [process.platform === 'darwin' ? 'h264_videotoolbox' : 'libx264']

  let lastError = 'Compression failed'
  for (const encoder of encoders) {
    const videoArgs = encoder === 'libx264'
      ? ['-c:v', encoder, '-preset', 'veryfast', '-crf', '23', '-threads', '4']
      : encoder === 'h264_nvenc'
        ? ['-c:v', encoder, '-preset', 'p4', '-rc', 'vbr', '-b:v', bitrate, '-maxrate', maxrate, '-bufsize', bufsize]
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
        '-f', 'mp4',
        partialPath,
      ], onProgress)
      const outputSizeBytes = promotePreparedOutput(sourcePath, partialPath, outputPath)
      log.info(
        `[VodCompressor] Done: ${(statSync(sourcePath).size / (1024 ** 3)).toFixed(2)} GB → ` +
        `${(outputSizeBytes / (1024 ** 3)).toFixed(2)} GB`,
      )
      return { ok: true, outputPath, outputSizeBytes }
    } catch (err) {
      clearPreparedOutput(outputPath)
      if (err instanceof BackgroundWorkCancelledError) throw err
      lastError = err instanceof Error ? err.message : String(err)
      log.warn(`[VodCompressor] ${encoder} failed:`, lastError)
    }
  }

  return { ok: false, outputPath, outputSizeBytes: 0, error: lastError }
}

function runFfmpeg(args: string[], onProgress?: (percent: number) => void): Promise<void> {
  return backgroundWork.run((signal) => runFfmpegOnce(args, signal, onProgress))
}

function runFfmpegOnce(args: string[], signal: AbortSignal, onProgress?: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegBin(), ['-threads', '2', '-filter_threads', '2', '-filter_complex_threads', '2', ...args], {
      stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true,
    })
    registerVodCompressionProc(proc)
    let stderr = ''
    const progressParser = new FfmpegProgressParser()
    let lastProgress = -1
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

    proc.stderr?.on('data', (d: Buffer) => {
      const chunk = d.toString()
      stderr = (stderr + chunk).slice(-16_384)
      const progress = progressParser.push(chunk)
      if (progress != null && progress !== lastProgress) {
        lastProgress = progress
        onProgress?.(progress)
      }
    })
    proc.on('error', (err) => settle(() => reject(err)))
    const pause = () => proc.kill('SIGKILL')
    signal.addEventListener('abort', pause, { once: true })
    proc.on('close', (code, exitSignal) => {
      signal.removeEventListener('abort', pause)
      if (signal.aborted) settle(() => reject(signal.reason))
      else if (code === 0) settle(() => resolve())
      else if (exitSignal === 'SIGKILL') settle(() => reject(new Error('Compression cancelled — match in progress')))
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
  clearPreparedOutput(compressedPathFor(sourcePath))
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
      removeQuietly(preparedMarkerPathFor(variant))
    } catch { /* ignore */ }
  }
  return freed
}
