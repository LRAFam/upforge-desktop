import { createWriteStream } from 'fs'
import fs from 'fs'
import { Readable, Transform } from 'stream'
import { pipeline } from 'stream/promises'
import b2 from 'unbzip2-stream'

export type ValveDemoDownloadPhase = 'gc_lookup' | 'downloading' | 'decompressing'

export interface ValveDemoDownloadProgress {
  phase: ValveDemoDownloadPhase
  bytesDone: number
  bytesTotal: number | null
  pct: number | null
}

export type ValveDemoDownloadProgressHandler = (progress: ValveDemoDownloadProgress) => void

function progressPct(bytesDone: number, bytesTotal: number | null): number | null {
  if (bytesTotal == null || bytesTotal <= 0) return null
  return Math.min(100, Math.round((bytesDone / bytesTotal) * 100))
}

function createByteCounterTransform(
  bytesTotal: number | null,
  phase: ValveDemoDownloadPhase,
  onProgress?: ValveDemoDownloadProgressHandler,
): Transform {
  let bytesDone = 0
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytesDone += chunk.length
      onProgress?.({
        phase,
        bytesDone,
        bytesTotal,
        pct: progressPct(bytesDone, bytesTotal),
      })
      callback(null, chunk)
    },
  })
}

/** Download a Valve CDN demo archive (.dem or .dem.bz2) with byte progress. */
export async function downloadValveDemoArchive(
  demoUrl: string,
  destPath: string,
  onProgress?: ValveDemoDownloadProgressHandler,
): Promise<void> {
  const res = await fetch(demoUrl, { redirect: 'follow' })
  if (res.status === 404) {
    throw new Error('Valve demo download link expired — download the replay in-game.')
  }
  if (!res.ok || !res.body) {
    throw new Error(`Demo download failed (${res.status}).`)
  }

  const contentLengthHeader = res.headers.get('content-length')
  const bytesTotal = contentLengthHeader ? Number.parseInt(contentLengthHeader, 10) : null
  const resolvedTotal = Number.isFinite(bytesTotal) && (bytesTotal as number) > 0
    ? (bytesTotal as number)
    : null

  onProgress?.({
    phase: 'downloading',
    bytesDone: 0,
    bytesTotal: resolvedTotal,
    pct: resolvedTotal ? 0 : null,
  })

  const tmpPath = `${destPath}.part`
  const out = createWriteStream(tmpPath)
  const nodeStream = Readable.fromWeb(res.body as import('stream/web').ReadableStream)
  const counter = createByteCounterTransform(resolvedTotal, 'downloading', onProgress)

  if (demoUrl.endsWith('.bz2')) {
    const decompressCounter = createByteCounterTransform(null, 'decompressing', onProgress)
    await pipeline(nodeStream, counter, b2(), decompressCounter, out)
  } else {
    await pipeline(nodeStream, counter, out)
  }

  fs.renameSync(tmpPath, destPath)
}
