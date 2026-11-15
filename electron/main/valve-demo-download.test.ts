import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { detectValveDemoArchiveFormat, downloadValveDemoArchive } from './valve-demo-download'

const fixtureDir = path.join(__dirname, '__fixtures__', 'valve-demo')
const fixture = (name: string) => fs.readFileSync(path.join(fixtureDir, name))

let dir: string
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-download-')); vi.useFakeTimers(); vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => { const c = new AbortController(); setTimeout(() => c.abort(), ms); return c.signal }) })
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); fs.rmSync(dir, { recursive: true, force: true }) })

it('keeps a transfer alive beyond five minutes while bytes keep arriving', async () => {
  let controller!: ReadableStreamDefaultController<Uint8Array>
  let signal!: AbortSignal
  vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
    signal = options.signal
    return new Response(new ReadableStream<Uint8Array>({ start(c) { controller = c } }))
  }))
  const dest = path.join(dir, 'match.dem')
  const transfer = downloadValveDemoArchive('https://example.invalid/demo.dem', dest)
  const outcome = transfer.catch(error => error)
  await vi.advanceTimersByTimeAsync(0)
  for (let i = 0; i < 14; i++) {
    controller.enqueue(new Uint8Array([1, 2, 3]))
    await vi.advanceTimersByTimeAsync(30_000)
    expect(signal.aborted).toBe(false)
  }
  controller.close()
  expect(await outcome).toBeUndefined()
  expect(fs.statSync(dest).size).toBe(42)
})

it('aborts a body that stops delivering bytes and removes partial output', async () => {
  let signal!: AbortSignal
  vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
    signal = options.signal
    return new Response(new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array([1])) } }))
  }))
  const dest = path.join(dir, 'match.dem')
  const outcome = downloadValveDemoArchive('https://example.invalid/demo.dem', dest).catch(error => error)
  await vi.advanceTimersByTimeAsync(90_000)
  expect(signal.aborted).toBe(true)
  expect((await outcome).message).toMatch(/stalled/i)
  expect(fs.existsSync(dest)).toBe(false)
  expect(fs.existsSync(dest + '.part')).toBe(false)
})

it('detects the archive format from magic bytes', () => {
  expect(detectValveDemoArchiveFormat(fixture('sample.dem.zst'))).toBe('zstd')
  expect(detectValveDemoArchiveFormat(fixture('sample.dem.bz2'))).toBe('bzip2')
  expect(detectValveDemoArchiveFormat(fixture('sample.dem'))).toBe('raw')
  expect(detectValveDemoArchiveFormat(Buffer.from([0x28]))).toBe('raw')
})

/** Serve `body` in small chunks so the magic bytes can straddle chunk boundaries. */
function stubFetchWith(body: Buffer, chunkSize = 3) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream<Uint8Array>({
    start(c) {
      for (let i = 0; i < body.length; i += chunkSize) c.enqueue(new Uint8Array(body.subarray(i, i + chunkSize)))
      c.close()
    },
  }), { headers: { 'content-length': String(body.length) } })))
}

it.each([
  ['Zstandard data under a .dem.bz2 name', 'sample.dem.zst', 'https://example.invalid/1_2.dem.bz2'],
  ['bzip2 data under a .dem.bz2 name', 'sample.dem.bz2', 'https://example.invalid/1_2.dem.bz2'],
  ['an uncompressed demo', 'sample.dem', 'https://example.invalid/1_2.dem'],
])('unpacks %s', async (_label, file, url) => {
  vi.useRealTimers()
  stubFetchWith(fixture(file))
  const dest = path.join(dir, 'match.dem')
  const phases = new Set<string>()
  await downloadValveDemoArchive(url, dest, p => phases.add(p.phase))
  expect(fs.readFileSync(dest).equals(fixture('sample.dem'))).toBe(true)
  expect(phases.has('decompressing')).toBe(file !== 'sample.dem')
  expect(fs.existsSync(dest + '.part')).toBe(false)
})

it('fails and removes partial output when the archive is corrupt', async () => {
  vi.useRealTimers()
  const corrupt = Buffer.concat([fixture('sample.dem.zst').subarray(0, 8), Buffer.alloc(64, 0xff)])
  stubFetchWith(corrupt)
  const dest = path.join(dir, 'match.dem')
  await expect(downloadValveDemoArchive('https://example.invalid/1_2.dem.bz2', dest)).rejects.toBeTruthy()
  expect(fs.existsSync(dest)).toBe(false)
  expect(fs.existsSync(dest + '.part')).toBe(false)
})
