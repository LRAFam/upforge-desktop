import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'events'
import fs from 'fs'
import os from 'os'
import path from 'path'

const ffmpeg = vi.hoisted(() => ({ calls: [] as string[][] }))
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: true } }))
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('./match-priority-guard', () => ({ registerVodCompressionProc: vi.fn() }))
vi.mock('./background-work', () => ({
  backgroundWork: { run: (fn: (signal: AbortSignal) => Promise<void>) => fn(new AbortController().signal) },
  BackgroundWorkCancelledError: class extends Error {},
}))
vi.mock('child_process', () => ({
  // Fake ffmpeg: writes a small output file at the last argument and exits 0.
  spawn: (_bin: string, args: string[]) => {
    ffmpeg.calls.push(args)
    const proc = Object.assign(new EventEmitter(), { stderr: new EventEmitter(), kill: vi.fn(), pid: undefined })
    setTimeout(() => {
      const out = args[args.length - 1]
      fs.writeFileSync(out, '')
      // Stream copy keeps the size; a transcode shrinks it.
      fs.truncateSync(out, args.includes('copy') ? 2 * 1024 ** 3 : 1024)
      proc.emit('close', 0, null)
    }, 0)
    return proc
  },
}))

import { resolveUploadVideoPath } from './vod-compressor'

let dir = ''
beforeEach(() => { ffmpeg.calls = []; dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upforge-vod-')) })
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

describe('resolveUploadVideoPath for a large MKV', () => {
  it('leaves exactly one _upforge.mp4 sibling (no foo_upforge_upforge.mp4)', async () => {
    const source = path.join(dir, 'match.mkv')
    fs.writeFileSync(source, '')
    fs.truncateSync(source, 2 * 1024 ** 3) // sparse 2 GB, over the compress threshold
    const out = await resolveUploadVideoPath(source)
    expect(out.path).toBe(path.join(dir, 'match_upforge.mp4'))
    expect(fs.readdirSync(dir).sort()).toEqual(['match.mkv', 'match_upforge.mp4'])
    expect(ffmpeg.calls).toHaveLength(1)
  })
})
