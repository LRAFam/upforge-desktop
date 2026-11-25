import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'events'
import fs from 'fs'
import os from 'os'
import path from 'path'

const mocks = vi.hoisted(() => ({ spawn: vi.fn() }))
vi.mock('child_process', () => ({ spawn: mocks.spawn }))
vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() } }))
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: true } }))
vi.mock('electron-log', () => ({ default: { warn: vi.fn(), info: vi.fn() } }))

import { ClipExtractor } from './clip-extractor'
import { backgroundWork } from './background-work'

let dir: string
let source: string
let children: Array<EventEmitter & { stderr: EventEmitter; kill: ReturnType<typeof vi.fn> }>
beforeEach(() => {
  vi.useFakeTimers()
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upforge-extract-timeout-'))
  source = path.join(dir, 'source.mp4')
  fs.writeFileSync(source, Buffer.alloc(2_048, 42))
  children = []
  backgroundWork.configure(() => false)
  mocks.spawn.mockReset().mockImplementation(() => {
    const child = Object.assign(new EventEmitter(), { stderr: new EventEmitter(), kill: vi.fn() })
    child.kill.mockImplementation(() => {
      queueMicrotask(() => child.emit('close', null))
      return true
    })
    children.push(child)
    return child
  })
})
afterEach(() => {
  backgroundWork.cancel()
  backgroundWork.configure(() => false)
  vi.useRealTimers()
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('bounded clip extraction', () => {
  it.each([
    { durationMs: 13_000, timeoutMs: 120_000 },
    { durationMs: 60_000, timeoutMs: 300_000 },
    { durationMs: 180_000, timeoutMs: 600_000 },
  ])('stops a stalled $durationMs ms encode at $timeoutMs ms, preserving its source', async ({ durationMs, timeoutMs }) => {
    const output = path.join(dir, 'partial.mp4')
    fs.writeFileSync(output, 'partial output')
    const pending = new ClipExtractor().extract({ sourcePath: source, outputPath: output, startOffsetMs: 0, durationMs })
    const rejected = expect(pending).rejects.toThrow('ffmpeg timed out')
    await vi.advanceTimersByTimeAsync(timeoutMs - 1)
    expect(children).toHaveLength(1)
    expect(children[0].kill).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await rejected
    expect(children[0].kill).toHaveBeenCalledOnce()
    expect(mocks.spawn).toHaveBeenCalledOnce()
    expect(fs.existsSync(output)).toBe(false)
    expect(fs.readFileSync(source)).toEqual(Buffer.alloc(2_048, 42))
    expect(vi.getTimerCount()).toBe(0)
  })

  it('bounds metadata probe retries and keeps unreadable input available for later retry', async () => {
    const pending = new ClipExtractor().probeWithRetry(source)
    await vi.advanceTimersByTimeAsync(108_000)
    expect(await pending).toEqual({
      ok: false,
      reason: 'Recording probe timed out — file may still be finalising or disk is slow.',
    })
    expect(children).toHaveLength(5)
    for (const child of children) expect(child.kill).toHaveBeenCalledOnce()
    for (const [, args] of mocks.spawn.mock.calls) {
      expect(args).toEqual(['-hide_banner', '-v', 'info', '-i', source])
    }
    expect(fs.readFileSync(source)).toEqual(Buffer.alloc(2_048, 42))
    expect(vi.getTimerCount()).toBe(0)
  })

  it('recovers when metadata becomes readable after the first probe times out', async () => {
    const pending = new ClipExtractor().probeWithRetry(source)
    await vi.advanceTimersByTimeAsync(22_000)
    expect(children).toHaveLength(2)
    children[1].stderr.emit('data', Buffer.from('Duration: 00:02:00.00\nStream #0:0: Video: h264\nAt least one output file must be specified'))
    children[1].emit('close', 1)
    expect(await pending).toMatchObject({ ok: true })
    expect(children[0].kill).toHaveBeenCalledOnce()
    expect(children[1].kill).not.toHaveBeenCalled()
    expect(fs.readFileSync(source)).toEqual(Buffer.alloc(2_048, 42))
    expect(vi.getTimerCount()).toBe(0)
  })
})
