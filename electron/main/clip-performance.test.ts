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
let calls: string[][]
let children: Array<EventEmitter & { stderr: EventEmitter; kill: () => boolean }>
let behavior: (child: typeof children[number], args: string[]) => void
beforeEach(() => {
  calls = []
  children = []
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upforge-clip-test-'))
  backgroundWork.configure(() => false)
  mocks.spawn.mockImplementation((_bin, args: string[]) => {
    const child = Object.assign(new EventEmitter(), {
      stderr: new EventEmitter(),
      kill: () => { queueMicrotask(() => child.emit('close', null)); return true },
    })
    calls.push(args)
    children.push(child)
    queueMicrotask(() => behavior(child, args))
    return child
  })
})
afterEach(() => {
  backgroundWork.cancel()
  backgroundWork.configure(() => false)
  fs.rmSync(dir, { recursive: true, force: true })
})
const opts = () => ({ sourcePath: path.join(dir, 'source.mp4'), outputPath: path.join(dir, 'clip.mp4'), startOffsetMs: 1_800_123, durationMs: 12_000, accurateSeek: true })
describe('clip processing performance', () => {
  it('seeks before decoding a late-match clip and preserves the exact timestamp and duration', async () => {
    behavior = child => { child.emit('close', 0) }
    await new ClipExtractor().extract(opts())
    const args = calls[0]!
    expect(args.indexOf('-ss')).toBeLessThan(args.indexOf('-i'))
    expect(args[args.indexOf('-ss') + 1]).toBe('1800.123')
    expect(args[args.indexOf('-t') + 1]).toBe('12')
    expect(args).toContain('-accurate_seek')
    expect(args).toContain(process.platform === 'win32' ? 'h264_nvenc' : process.platform === 'darwin' ? 'h264_videotoolbox' : 'libx264')
  })

  it('falls back when hardware encoders cannot initialise, and remembers the working encoder', async () => {
    behavior = (child, args) => {
      const software = args.includes('libx264')
      if (!software) child.stderr.emit('data', Buffer.from('Error while opening encoder: unsupported device'))
      child.emit('close', software ? 0 : 1)
    }
    const extractor = new ClipExtractor()
    await extractor.extract(opts())
    expect(calls.at(-1)).toContain('libx264')
    const attempts = calls.length
    await extractor.extract(opts())
    expect(calls).toHaveLength(attempts + 1)
    expect(calls.at(-1)).toContain('libx264')
  })

  it('restarts an interrupted encode after the match without falling back to another encoder', async () => {
    let playing = false
    backgroundWork.configure(() => playing)
    behavior = () => {}
    const pending = new ClipExtractor().extract(opts())
    await new Promise(resolve => setTimeout(resolve, 10))
    playing = true
    backgroundWork.pause()
    await new Promise(resolve => setTimeout(resolve, 300))
    expect(calls).toHaveLength(1)
    behavior = child => { child.emit('close', 0) }
    playing = false
    await pending
    expect(calls).toHaveLength(2)
    expect(calls[1]).toEqual(calls[0])
  })

  it('reports corrupt input rather than retrying every encoder', async () => {
    behavior = child => {
      child.stderr.emit('data', Buffer.from('Invalid data found when processing input'))
      child.emit('close', 1)
    }
    await expect(new ClipExtractor().extract(opts())).rejects.toThrow('Invalid data')
    expect(calls).toHaveLength(1)
  })
})
