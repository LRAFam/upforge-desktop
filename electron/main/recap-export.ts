import fs from 'fs'
import { shell } from 'electron'
import { randomUUID } from 'crypto'
import log from 'electron-log'
import { ClipExtractor } from './clip-extractor'
import type { ClipStore } from './clip-store'
import type { RecordingsStore } from './recordings-store'

export interface RecapHighlightInput {
  id: string
  clipId?: string | null
  videoOffsetMs?: number | null
  rank?: number
}

export interface RecapExportDeps {
  clipStore: ClipStore
  clipExtractor: ClipExtractor
  recordingsStore: RecordingsStore
}

export async function exportMatchRecap(
  deps: RecapExportDeps,
  recordingId: string,
  highlights: RecapHighlightInput[],
  maxMoments = 5,
): Promise<{ ok: boolean; path?: string; error?: string }> {
  const recording = deps.recordingsStore.getById(recordingId)
  if (!recording?.path || !fs.existsSync(recording.path)) {
    return { ok: false, error: 'Recording file not found' }
  }

  const probe = await deps.clipExtractor.probe(recording.path)
  if (!probe.ok) {
    return { ok: false, error: probe.reason ?? 'Recording unreadable' }
  }

  const sorted = [...highlights]
    .sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0))
    .slice(0, maxMoments)

  if (sorted.length === 0) {
    return { ok: false, error: 'No recap moments to export' }
  }

  const segmentPaths: string[] = []
  const tempIds: string[] = []

  try {
    for (const h of sorted) {
      if (h.clipId) {
        const clip = deps.clipStore.getById(h.clipId)
        if (clip?.path && fs.existsSync(clip.path)) {
          segmentPaths.push(clip.path)
          continue
        }
      }

      const offsetMs = h.videoOffsetMs
      if (offsetMs == null || offsetMs < 0) continue

      const tempId = randomUUID()
      tempIds.push(tempId)
      const outPath = ClipExtractor.clipPath(`recap_${tempId}`)
      const startMs = Math.max(0, offsetMs - 4000)
      await deps.clipExtractor.extract({
        sourcePath: recording.path,
        startOffsetMs: startMs,
        durationMs: 13_000,
        outputPath: outPath,
      })
      segmentPaths.push(outPath)
    }

    if (segmentPaths.length === 0) {
      return { ok: false, error: 'Could not resolve any video segments' }
    }

    const recapId = randomUUID()
    const outputPath = ClipExtractor.clipPath(`match_recap_${recapId}`)
    await deps.clipExtractor.concat(segmentPaths, outputPath)

    shell.showItemInFolder(outputPath)
    log.info('[RecapExport] Wrote match recap:', outputPath)
    return { ok: true, path: outputPath }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.warn('[RecapExport] Failed:', msg)
    return { ok: false, error: msg }
  } finally {
    for (const id of tempIds) {
      const p = ClipExtractor.clipPath(`recap_${id}`)
      try { if (fs.existsSync(p)) fs.unlinkSync(p) } catch { /* ignore */ }
    }
  }
}
