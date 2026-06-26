/**
 * Extract duel windows locally and upload small MP4s for AI review
 * (avoids downloading the full match VOD on the AI service).
 */
import { mkdtemp, rm, unlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import log from 'electron-log'
import type { ClipExtractor } from './clip-extractor'
import type { DuelMomentManifest } from './moment-picker'
import type { UploadManager } from './upload-manager'

const EXTRACT_CONCURRENCY = 2
const UPLOAD_CONCURRENCY = 4

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

export async function extractAndUploadDuelClips(opts: {
  uploadManager: UploadManager
  jobId: string
  videoPath: string
  moments: DuelMomentManifest[]
  clipExtractor: ClipExtractor
}): Promise<DuelMomentManifest[]> {
  const { uploadManager, jobId, videoPath, moments, clipExtractor } = opts
  if (moments.length === 0) return []

  const probe = await clipExtractor.probe(videoPath)
  if (!probe.ok) {
    throw new Error(probe.reason ?? 'Recording file is incomplete — cannot extract duel clips')
  }

  const workDir = await mkdtemp(join(tmpdir(), 'upforge-duel-clips-'))
  const localPaths = new Map<string, string>()

  try {
    await mapPool(moments, EXTRACT_CONCURRENCY, async (moment) => {
      const durationMs = Math.max(500, moment.window_end_ms - moment.window_start_ms)
      const safeId = moment.moment_id.replace(/[^a-zA-Z0-9._-]/g, '_')
      const outPath = join(workDir, `${safeId}.mp4`)
      await clipExtractor.extract({
        sourcePath: videoPath,
        startOffsetMs: moment.window_start_ms,
        durationMs,
        outputPath: outPath,
      })
      localPaths.set(moment.moment_id, outPath)
    })

    const presigned = await uploadManager.presignDuelClips(
      jobId,
      moments.map((m) => m.moment_id),
    )

    await mapPool(presigned, UPLOAD_CONCURRENCY, async (clip) => {
      const local = localPaths.get(clip.moment_id)
      if (!local) throw new Error(`Missing local clip for ${clip.moment_id}`)
      await uploadManager.putFileToS3(clip.upload_url, local)
    })

    const keyById = new Map(presigned.map((c) => [c.moment_id, c.s3_key]))
    const withKeys = moments.map((m) => ({
      ...m,
      clip_s3_key: keyById.get(m.moment_id),
    }))

    log.info(`[DuelClips] Uploaded ${withKeys.length} duel clips for job ${jobId}`)
    return withKeys
  } finally {
    for (const p of localPaths.values()) {
      await unlink(p).catch(() => {})
    }
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}
