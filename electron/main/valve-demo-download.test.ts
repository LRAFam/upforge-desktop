import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { downloadValveDemoArchive } from './valve-demo-download'

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
