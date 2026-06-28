/**
 * Extract duel windows locally and upload small MP4s for AI review
 * (avoids downloading the full match VOD on the AI service).
 */
import { existsSync } from 'fs'
import { mkdtemp, rm, stat, unlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import log from 'electron-log'
import type { ClipExtractor } from './clip-extractor'
import type { DuelMomentManifest } from './moment-picker'
import type { UploadManager } from './upload-manager'
import { preferredRecordingPath } from './recording-path-resolver'
import { needsTranscodeForCloudUpload, remuxVodForUpload } from './vod-compressor'
import { reportPipelineError } from './pipeline-errors'

const EXTRACT_CONCURRENCY = 2
const UPLOAD_CONCURRENCY = 4
/** Clips smaller than this are usually corrupt or empty extractions — skip upload. */
const MIN_DUEL_CLIP_BYTES = 12 * 1024

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i]!, i)
    }
  })
  await Promise.all(workers)
  return results
}

async function resolveDuelClipSourcePath(
  videoPath: string,
  clipExtractor: ClipExtractor,
): Promise<string> {
  const preferred = preferredRecordingPath(videoPath)
  for (const candidate of [preferred, videoPath]) {
    if (!candidate || !existsSync(candidate)) continue
    const probe = await clipExtractor.probe(candidate)
    if (probe.ok) return candidate
    log.warn(`[DuelClips] Unreadable source ${candidate}:`, probe.reason)
  }
  throw new Error('Recording file is incomplete or missing — cannot extract duel clips')
}

async function ensurePlayableExtractSource(
  sourcePath: string,
  workDir: string,
): Promise<string> {
  if (!needsTranscodeForCloudUpload(sourcePath)) return sourcePath
  const remuxed = await remuxVodForUpload(sourcePath)
  if (!remuxed.ok) {
    throw new Error(remuxed.error ?? 'Could not remux OBS recording for duel clip extraction')
  }
  const outPath = join(workDir, 'duel-source.mp4')
  const { copyFile } = await import('fs/promises')
  await copyFile(remuxed.outputPath, outPath)
  return outPath
}

export async function extractDuelPreviewClip(opts: {
  videoPath: string
  windowStartMs: number
  windowEndMs: number
  momentId: string
  clipExtractor: ClipExtractor
}): Promise<{ ok: true; path: string; bytes: number } | { ok: false; error: string }> {
  const { videoPath, windowStartMs, windowEndMs, momentId, clipExtractor } = opts
  const workDir = await mkdtemp(join(tmpdir(), 'upforge-duel-preview-'))
  try {
    const sourcePath = await resolveDuelClipSourcePath(videoPath, clipExtractor)
    const extractSource = await ensurePlayableExtractSource(sourcePath, workDir)
    const durationMs = Math.max(500, windowEndMs - windowStartMs)
    const safeId = momentId.replace(/[^a-zA-Z0-9._-]/g, '_')
    const outPath = join(workDir, `${safeId}.mp4`)
    await clipExtractor.extract({
      sourcePath: extractSource,
      startOffsetMs: windowStartMs,
      durationMs,
      outputPath: outPath,
      accurateSeek: true,
    })
    const { size } = await stat(outPath)
    if (size < MIN_DUEL_CLIP_BYTES) {
      return {
        ok: false,
        error: `Extracted clip is empty or corrupt (${size} bytes) — check sync or recording path`,
      }
    }
    return { ok: true, path: outPath, bytes: size }
  } catch (err) {
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function extractAndUploadDuelClips(opts: {
  uploadManager: UploadManager
  jobId: string
  videoPath: string
  moments: DuelMomentManifest[]
  clipExtractor: ClipExtractor
}): Promise<DuelMomentManifest[]> {
  const { uploadManager, jobId, videoPath, moments, clipExtractor } = opts
  if (moments.length === 0) return []

  const sourcePath = await resolveDuelClipSourcePath(videoPath, clipExtractor)
  const durationMs = await clipExtractor.probeDurationMs(sourcePath)
  if (durationMs != null) {
    const maxWindowEnd = Math.max(...moments.map((m) => m.window_end_ms))
    if (maxWindowEnd > durationMs + 2000) {
      log.warn(
        `[DuelClips] Death windows extend past recording (${maxWindowEnd}ms > ${durationMs}ms) — ` +
        `wrong file or timeline sync? source=${sourcePath}`,
      )
    }
  }

  const workDir = await mkdtemp(join(tmpdir(), 'upforge-duel-clips-'))
  const localPaths = new Map<string, string>()
  let skippedTooSmall = 0
  let extractFailed = 0

  try {
    await mapPool(moments, EXTRACT_CONCURRENCY, async (moment) => {
      const durationMs = Math.max(500, moment.window_end_ms - moment.window_start_ms)
      const safeId = moment.moment_id.replace(/[^a-zA-Z0-9._-]/g, '_')
      const outPath = join(workDir, `${safeId}.mp4`)
      try {
        await clipExtractor.extract({
          sourcePath,
          startOffsetMs: moment.window_start_ms,
          durationMs,
          outputPath: outPath,
          accurateSeek: true,
        })
        const { size } = await stat(outPath)
        if (size < MIN_DUEL_CLIP_BYTES) {
          skippedTooSmall++
          log.warn(
            `[DuelClips] Skipping ${moment.moment_id}: clip too small (${size} bytes) ` +
            `@ ${moment.window_start_ms}-${moment.window_end_ms}ms from ${sourcePath}`,
          )
          await unlink(outPath).catch(() => {})
          return
        }
        localPaths.set(moment.moment_id, outPath)
      } catch (err) {
        extractFailed++
        log.warn(`[DuelClips] Extract failed for ${moment.moment_id}:`, err)
      }
    })

    const uploadableIds = moments
      .map((m) => m.moment_id)
      .filter((id) => localPaths.has(id))

    if (uploadableIds.length > 0) {
      const presigned = await uploadManager.presignDuelClips(jobId, uploadableIds)

      await mapPool(presigned, UPLOAD_CONCURRENCY, async (clip) => {
        const local = localPaths.get(clip.moment_id)
        if (!local) return
        await uploadManager.putFileToS3(clip.upload_url, local)
      })

      const keyById = new Map(presigned.map((c) => [c.moment_id, c.s3_key]))
      const withKeys = moments.map((m) => ({
        ...m,
        clip_s3_key: keyById.get(m.moment_id),
      }))

      log.info(
        `[DuelClips] Uploaded ${uploadableIds.length}/${moments.length} duel clips for job ${jobId}`,
      )
      if (uploadableIds.length < moments.length) {
        reportPipelineError(
          'duel-clips',
          `Partial duel clip upload: ${uploadableIds.length}/${moments.length} for job ${jobId}`,
          {
            jobId,
            sourcePath,
            durationMs,
            skippedTooSmall,
            extractFailed,
            requested: moments.length,
            uploaded: uploadableIds.length,
          },
        )
      }
      return withKeys
    }

    reportPipelineError(
      'duel-clips',
      `No duel clips uploaded (${moments.length} requested) for job ${jobId}`,
      {
        jobId,
        sourcePath,
        durationMs,
        skippedTooSmall,
        extractFailed,
        requested: moments.length,
      },
    )
    log.warn(`[DuelClips] No duel clips extracted for job ${jobId} — AI will use full recording`)
    return moments

  } finally {
    for (const p of localPaths.values()) {
      await unlink(p).catch(() => {})
    }
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}
