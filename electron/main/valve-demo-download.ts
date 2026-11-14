import { createWriteStream } from 'fs'
import fs from 'fs'
import { PassThrough, Readable, Transform } from 'stream'
import { pipeline } from 'stream/promises'
import zlib from 'zlib'
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

export type ValveDemoArchiveFormat = 'bzip2' | 'zstd' | 'raw'

const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
const BZIP2_MAGIC = Buffer.from('BZh', 'ascii')
const SNIFF_BYTES = 4

/**
 * Pick the decompressor from the file's magic bytes, not its name: Valve now serves
 * Zstandard data under the old `.dem.bz2` name.
 */
export function detectValveDemoArchiveFormat(head: Buffer): ValveDemoArchiveFormat {
  if (head.length >= ZSTD_MAGIC.length && head.subarray(0, ZSTD_MAGIC.length).equals(ZSTD_MAGIC)) return 'zstd'
  if (head.length >= BZIP2_MAGIC.length && head.subarray(0, BZIP2_MAGIC.length).equals(BZIP2_MAGIC)) return 'bzip2'
  return 'raw'
}

function createDecompressor(format: ValveDemoArchiveFormat): Transform {
  if (format === 'zstd') {
    if (typeof zlib.createZstdDecompress !== 'function') {
      throw new Error('This demo is Zstandard-compressed and this app build cannot unpack it. Update UpForge and retry.')
    }
    return zlib.createZstdDecompress()
  }
  if (format === 'bzip2') return b2() as unknown as Transform
  return new PassThrough()
}

/**
 * Transform that sniffs the first bytes, then streams through bzip2, zstd or nothing.
 * A stream shorter than the sniff window is passed through unchanged.
 */
export function createAutoDecompressStream(onFormat?: (format: ValveDemoArchiveFormat) => void): Transform {
  let inner: Transform | null = null
  let head: Buffer[] = []
  let headLength = 0
  let outer: Transform

  /** Create the decompressor from the buffered head and return that head for writing. */
  const start = (): { stream: Transform; buffered: Buffer } => {
    const buffered = Buffer.concat(head, headLength)
    head = []
    const format = detectValveDemoArchiveFormat(buffered)
    onFormat?.(format)
    const stream = createDecompressor(format)
    stream.on('data', (data: Buffer) => { outer.push(data) })
    stream.on('error', (error: Error) => { outer.destroy(error) })
    inner = stream
    return { stream, buffered }
  }

  const writeInner = (stream: Transform, chunk: Buffer, callback: (error?: Error | null) => void) => {
    if (chunk.length === 0 || stream.write(chunk)) callback()
    else stream.once('drain', () => callback())
  }

  outer = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      try {
        if (inner) { writeInner(inner, chunk, callback); return }
        head.push(chunk)
        headLength += chunk.length
        if (headLength < SNIFF_BYTES) { callback(); return }
        const { stream, buffered } = start()
        writeInner(stream, buffered, callback)
      } catch (error) {
        callback(error as Error)
      }
    },
    flush(callback) {
      try {
        let stream = inner
        if (!stream) {
          const started = start()
          stream = started.stream
          if (started.buffered.length) stream.write(started.buffered)
        }
        // Errors are forwarded by the inner 'error' listener (outer.destroy).
        stream.once('end', () => callback())
        stream.end()
      } catch (error) {
        callback(error as Error)
      }
    },
  })
  return outer
}

/** Download a Valve CDN demo archive (.dem or .dem.bz2) with byte progress. */
export async function downloadValveDemoArchive(
  demoUrl: string,
  destPath: string,
  onProgress?: ValveDemoDownloadProgressHandler,
): Promise<void> {
  const controller = new AbortController()
  const tmpPath = `${destPath}.part`
  let timer: ReturnType<typeof setTimeout> | undefined
  // Limit inactivity, not total transfer time: slow healthy downloads can finish.
  const touch = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => controller.abort(new Error('Demo download stalled. Check your connection and retry.')), 60_000)
  }
  touch()
  try {
    const res = await fetch(demoUrl, { redirect: 'follow', signal: controller.signal })
    touch()
    if (res.status === 404) {
      throw new Error('Valve has not made this demo available, or the link has expired. Try downloading the replay in-game.')
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

    const out = createWriteStream(tmpPath)
    const nodeStream = Readable.fromWeb(res.body as import('stream/web').ReadableStream)
    const counter = createByteCounterTransform(resolvedTotal, 'downloading', progress => {
      touch()
      onProgress?.(progress)
    })

    // Detect bzip2 / zstd / plain .dem from the magic bytes (Valve's file names are unreliable).
    let decompressing = false
    const decompressCounter = createByteCounterTransform(null, 'decompressing', progress => {
      if (decompressing) onProgress?.(progress)
    })
    const decompress = createAutoDecompressStream(format => { decompressing = format !== 'raw' })
    await pipeline(nodeStream, counter, decompress, decompressCounter, out, { signal: controller.signal })

    fs.renameSync(tmpPath, destPath)
  } catch (error) {
    await fs.promises.rm(tmpPath, { force: true })
    throw controller.signal.aborted ? controller.signal.reason : error
  } finally {
    if (timer) clearTimeout(timer)
  }
}
