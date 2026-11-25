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

let dir: string
let source: string
let children: Array<EventEmitter & { stderr: EventEmitter; kill: ReturnType<typeof vi.fn> }>
beforeEach(() => {
  vi.useFakeTimers()
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upforge-metadata-timeout-'))
  source = path.join(dir, 'source.mp4')
  fs.writeFileSync(source, Buffer.alloc(2048, 42))
  children = []
  mocks.spawn.mockReset().mockImplementation(() => {
    const child = Object.assign(new EventEmitter(), { stderr: new EventEmitter(), kill: vi.fn(() => true) })
    children.push(child)
    return child
  })
})
afterEach(() => {
  vi.useRealTimers()
  fs.rmSync(dir, { recursive: true, force: true })
})

const metadata = 'Duration: 00:02:03.45\nStream #0:0: Video: h264, yuv420p, 1920x1080, 30 fps\nAt least one output file must be specified'
describe.each(['probeDurationMs', 'probeDimensions'] as const)('%s lifecycle', method => {
  it('bounds an owned child that never exits, even with partial metadata, without touching another probe or source', async () => {
    const extractor = new ClipExtractor()
    const completed = vi.fn()
    const pending = extractor[method](source).then(completed)
    children[0].stderr.emit('data', Buffer.from(metadata))
    await vi.advanceTimersByTimeAsync(10_000)
    const otherCompleted = vi.fn()
    const other = extractor[method](source).then(otherCompleted)
    await vi.advanceTimersByTimeAsync(9_999)
    expect(children[0].kill).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(children[0].kill).toHaveBeenCalledOnce()
    expect(children[1].kill).not.toHaveBeenCalled()
    expect(completed).toHaveBeenCalledExactlyOnceWith(null)
    expect(otherCompleted).not.toHaveBeenCalled()
    // A late child event must not turn timed-out partial metadata into success.
    children[0].emit('exit', 1)
    children[0].emit('close', 1)
    expect(completed).toHaveBeenCalledTimes(1)
    children[1].stderr.emit('data', Buffer.from(metadata))
    children[1].emit('exit', 1)
    children[1].emit('close', 1)
    await Promise.all([pending, other])
    expect(otherCompleted).toHaveBeenCalledExactlyOnceWith(method === 'probeDurationMs' ? 123450 : { width: 1920, height: 1080 })
    expect(fs.readFileSync(source)).toEqual(Buffer.alloc(2048, 42))
    expect(vi.getTimerCount()).toBe(0)
  })

  it('waits for stderr to drain after process exit before parsing metadata', async () => {
    const completed = vi.fn()
    const pending = new ClipExtractor()[method](source).then(completed)
    children[0].emit('exit', 1)
    await Promise.resolve()
    await Promise.resolve()
    expect(completed).not.toHaveBeenCalled()
    children[0].stderr.emit('data', Buffer.from(metadata))
    children[0].emit('close', 1)
    await pending
    expect(completed).toHaveBeenCalledExactlyOnceWith(method === 'probeDurationMs' ? 123450 : { width: 1920, height: 1080 })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('settles a spawn error once and clears its timeout', async () => {
    const completed = vi.fn()
    const pending = new ClipExtractor()[method](source).then(completed)
    children[0].emit('error', new Error('spawn ffmpeg ENOENT'))
    children[0].emit('exit', 1)
    children[0].emit('close', 1)
    await pending
    await vi.advanceTimersByTimeAsync(60_000)
    expect(completed).toHaveBeenCalledExactlyOnceWith(null)
    expect(children[0].kill).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    expect(fs.readFileSync(source)).toEqual(Buffer.alloc(2048, 42))
  })

  it('returns unknown when the completed probe has no requested metadata', async () => {
    const pending = new ClipExtractor()[method](source)
    children[0].stderr.emit('data', Buffer.from('moov atom not found'))
    children[0].emit('exit', 1)
    children[0].emit('close', 1)
    expect(await pending).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })
})
