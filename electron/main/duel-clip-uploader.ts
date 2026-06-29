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
import { needsTranscodeForCloudUpload, recordingPathVariants, remuxVodForUpload } from './vod-compressor'
import { reportPipelineError } from './pipeline-errors'

const EXTRACT_CONCURRENCY = 2
const UPLOAD_CONCURRENCY = 4
/** Clips smaller than this are usually corrupt or empty extractions — skip upload. */
const MIN_DUEL_CLIP_BYTES = 12 * 1024

export function countMomentsWithClipKeys(moments: DuelMomentManifest[]): number {
  return moments.filter((m) => Boolean(m.clip_s3_key?.trim())).length
}

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
  const candidates = [...new Set([preferred, videoPath, ...recordingPathVariants(videoPath)])]
  for (const candidate of candidates) {
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

async function extractMomentClip(
  clipExtractor: ClipExtractor,
  extractSource: string,
  moment: DuelMomentManifest,
  outPath: string,
): Promise<{ ok: true; bytes: number } | { ok: false; reason: string }> {
  const durationMs = Math.max(500, moment.window_end_ms - moment.window_start_ms)
  const attempts = [true, false] as const
  let lastReason = 'unknown extract error'

  for (const accurateSeek of attempts) {
    try {
      await unlink(outPath).catch(() => {})
      await clipExtractor.extract({
        sourcePath: extractSource,
        startOffsetMs: moment.window_start_ms,
        durationMs,
        outputPath: outPath,
        accurateSeek,
      })
      const { size } = await stat(outPath)
      if (size >= MIN_DUEL_CLIP_BYTES) {
        return { ok: true, bytes: size }
      }
      lastReason = `clip too small (${size} bytes)`
      log.warn(
        `[DuelClips] ${moment.moment_id} ${lastReason} accurateSeek=${accurateSeek} ` +
        `@ ${moment.window_start_ms}-${moment.window_end_ms}ms`,
      )
    } catch (err) {
      lastReason = err instanceof Error ? err.message : String(err)
      log.warn(`[DuelClips] Extract failed for ${moment.moment_id} (accurateSeek=${accurateSeek}):`, err)
    }
  }

  return { ok: false, reason: lastReason }
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
    const safeId = momentId.replace(/[^a-zA-Z0-9._-]/g, '_')
    const outPath = join(workDir, `${safeId}.mp4`)
    const result = await extractMomentClip(
      clipExtractor,
      extractSource,
      {
        moment_id: momentId,
        round: 0,
        video_offset_ms: windowEndMs,
        window_start_ms: windowStartMs,
        window_end_ms: windowEndMs,
        isolated: false,
      },
      outPath,
    )
    if (!result.ok) {
      return { ok: false, error: result.reason }
    }
    return { ok: true, path: outPath, bytes: result.bytes }
  } catch (err) {
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

async function uploadLocalClips(
  uploadManager: UploadManager,
  jobId: string,
  moments: DuelMomentManifest[],
  localPaths: Map<string, string>,
): Promise<DuelMomentManifest[]> {
  const uploadableIds = moments
    .map((m) => m.moment_id)
    .filter((id) => localPaths.has(id))

  if (uploadableIds.length === 0) {
    return moments
  }

  const presigned = await uploadManager.presignDuelClips(jobId, uploadableIds)
  const uploadedIds = new Set<string>()

  await mapPool(presigned, UPLOAD_CONCURRENCY, async (clip) => {
    const local = localPaths.get(clip.moment_id)
    if (!local) return
    try {
      await uploadManager.putFileToS3(clip.upload_url, local)
      uploadedIds.add(clip.moment_id)
    } catch (err) {
      log.warn(`[DuelClips] S3 PUT failed for ${clip.moment_id}:`, err)
    }
  })

  const keyById = new Map(
    presigned
      .filter((c) => uploadedIds.has(c.moment_id))
      .map((c) => [c.moment_id, c.s3_key]),
  )

  return moments.map((m) => ({
    ...m,
    clip_s3_key: keyById.get(m.moment_id) ?? m.clip_s3_key,
  }))
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
  const workDir = await mkdtemp(join(tmpdir(), 'upforge-duel-clips-'))
  const extractSource = await ensurePlayableExtractSource(sourcePath, workDir)
  const durationMs = await clipExtractor.probeDurationMs(extractSource)
  if (durationMs != null) {
    const maxWindowEnd = Math.max(...moments.map((m) => m.window_end_ms))
    if (maxWindowEnd > durationMs + 2000) {
      log.warn(
        `[DuelClips] Death windows extend past recording (${maxWindowEnd}ms > ${durationMs}ms) — ` +
        `wrong file or timeline sync? source=${sourcePath}`,
      )
    }
  }

  const localPaths = new Map<string, string>()
  let skippedTooSmall = 0
  let extractFailed = 0

  try {
    await mapPool(moments, EXTRACT_CONCURRENCY, async (moment) => {
      const safeId = moment.moment_id.replace(/[^a-zA-Z0-9._-]/g, '_')
      const outPath = join(workDir, `${safeId}.mp4`)
      const result = await extractMomentClip(clipExtractor, extractSource, moment, outPath)
      if (result.ok) {
        localPaths.set(moment.moment_id, outPath)
      } else if (result.reason.includes('too small')) {
        skippedTooSmall++
      } else {
        extractFailed++
      }
    })

    let withKeys = await uploadLocalClips(uploadManager, jobId, moments, localPaths)
    let uploaded = countMomentsWithClipKeys(withKeys)

    if (uploaded > 0 && uploaded < moments.length) {
      log.info(
        `[DuelClips] Uploaded ${uploaded}/${moments.length} duel clips for job ${jobId}`,
      )
      reportPipelineError(
        'duel-clips',
        `Partial duel clip upload: ${uploaded}/${moments.length} for job ${jobId}`,
        {
          jobId,
          sourcePath,
          durationMs,
          skippedTooSmall,
          extractFailed,
          requested: moments.length,
          uploaded,
        },
      )
      return withKeys
    }

    if (uploaded === moments.length) {
      log.info(`[DuelClips] Uploaded ${uploaded}/${moments.length} duel clips for job ${jobId}`)
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
    log.warn(`[DuelClips] No duel clips extracted for job ${jobId} — server will backfill from VOD`)
    return withKeys
  } finally {
    for (const p of localPaths.values()) {
      await unlink(p).catch(() => {})
    }
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}
