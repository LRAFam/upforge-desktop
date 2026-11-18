import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'events'
import fs from 'fs'
import os from 'os'
import path from 'path'

const ffmpeg = vi.hoisted(() => ({ calls: [] as string[][], cancel: false }))
const Cancelled = vi.hoisted(() => class BackgroundWorkCancelledError extends Error {})
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: true } }))
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('./match-priority-guard', () => ({ registerVodCompressionProc: vi.fn() }))
vi.mock('./background-work', () => ({
  backgroundWork: {
    run: async (fn: (signal: AbortSignal) => Promise<void>) => {
      const controller = new AbortController()
      const work = fn(controller.signal)
      if (ffmpeg.cancel) {
        // Sign-out / quit while FFmpeg is mid-write.
        await new Promise(r => setTimeout(r, 5))
        controller.abort(new Cancelled('cancelled'))
      }
      return work
    },
  },
  BackgroundWorkCancelledError: Cancelled,
}))
vi.mock('child_process', () => ({
  spawn: (_bin: string, args: string[]) => {
    ffmpeg.calls.push(args)
    const proc = Object.assign(new EventEmitter(), { stderr: new EventEmitter(), kill: vi.fn(), pid: undefined })
    const out = args[args.length - 1]
    fs.writeFileSync(out, 'ftyp-only-fragment-32-bytes.....')
    if (ffmpeg.cancel) {
      proc.kill = vi.fn(() => { setTimeout(() => proc.emit('close', null, 'SIGKILL'), 0); return true })
    } else {
      setTimeout(() => {
        fs.writeFileSync(out, Buffer.alloc(1024, 7))
        proc.emit('close', 0, null)
      }, 0)
    }
    return proc
  },
}))

import { compressVodForUpload, isVerifiedPreparedSibling, remuxVodForUpload, resolveUploadVideoPath } from './vod-compressor'

let dir = ''
let source = ''
beforeEach(() => {
  ffmpeg.calls = []
  ffmpeg.cancel = false
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upforge-partial-'))
  source = path.join(dir, 'match.mkv')
  fs.writeFileSync(source, Buffer.alloc(4096, 1))
})
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

describe('interrupted preparation is never reused', () => {
  it.each([
    ['remux', remuxVodForUpload],
    ['compress', compressVodForUpload],
  ] as const)('cancelling %s leaves no prepared sibling and the next save re-runs FFmpeg', async (_kind, prepare) => {
    ffmpeg.cancel = true
    await expect(prepare(source)).rejects.toBeInstanceOf(Cancelled)
    expect(fs.readdirSync(dir)).toEqual(['match.mkv'])

    ffmpeg.cancel = false
    ffmpeg.calls = []
    const resolved = await resolveUploadVideoPath(source)
    expect(ffmpeg.calls.length).toBeGreaterThan(0)
    expect(resolved.sizeBytes).toBe(1024)
    expect(isVerifiedPreparedSibling(source, resolved.path)).toBe(true)
  })

  it('FFmpeg writes to a .partial path, not the sibling the next save reads', async () => {
    await remuxVodForUpload(source)
    const target = ffmpeg.calls[0][ffmpeg.calls[0].length - 1]
    expect(target).toBe(path.join(dir, 'match_upforge.mp4.partial'))
    expect(ffmpeg.calls[0]).toContain('-f')
  })

  it('a newer, smaller sibling without a completion marker (crash / older build) is not trusted', async () => {
    const sibling = path.join(dir, 'match_upforge.mp4')
    fs.writeFileSync(sibling, 'ftyp-only-fragment-32-bytes.....')
    const future = new Date(Date.now() + 60_000)
    fs.utimesSync(sibling, future, future)
    const resolved = await resolveUploadVideoPath(source)
    expect(ffmpeg.calls.length).toBe(1)
    expect(resolved.sizeBytes).toBe(1024)
  })

  it('a verified sibling is reused without re-running FFmpeg', async () => {
    await resolveUploadVideoPath(source)
    ffmpeg.calls = []
    const again = await resolveUploadVideoPath(source)
    expect(ffmpeg.calls).toHaveLength(0)
    expect(again.path).toBe(path.join(dir, 'match_upforge.mp4'))
  })

  it('a marker from a different source version is rejected', async () => {
    const first = await resolveUploadVideoPath(source)
    fs.appendFileSync(source, 'more bytes')
    expect(isVerifiedPreparedSibling(source, first.path)).toBe(false)
  })

  it('a zero-byte or truncated sibling fails verification even with a marker', async () => {
    const first = await resolveUploadVideoPath(source)
    fs.truncateSync(first.path, 10)
    expect(isVerifiedPreparedSibling(source, first.path)).toBe(false)
    fs.truncateSync(first.path, 0)
    expect(isVerifiedPreparedSibling(source, first.path)).toBe(false)
  })
})
