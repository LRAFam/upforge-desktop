import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'events'
import fs from 'fs'
import os from 'os'
import path from 'path'

const ffmpeg = vi.hoisted(() => ({ calls: [] as string[][], error: null as string | null }))
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
      if (ffmpeg.error) {
        proc.emit('error', new Error(ffmpeg.error))
        return
      }
      const out = args[args.length - 1]
      fs.writeFileSync(out, '')
      // Stream copy keeps the size; a transcode shrinks it.
      fs.truncateSync(out, args.includes('copy') ? 2 * 1024 ** 3 : 1024)
      proc.emit('close', 0, null)
    }, 0)
    return proc
  },
}))

import { RecordingPreparationError, resolveUploadVideoPath } from './vod-compressor'
import { classifyAnalysisFailure } from '../../src/lib/analysis-failure-messages'

let dir = ''
beforeEach(() => { ffmpeg.calls = []; ffmpeg.error = null; dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upforge-vod-')) })
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

describe('resolveUploadVideoPath for a large MKV', () => {
  it('leaves exactly one _upforge.mp4 sibling (no foo_upforge_upforge.mp4)', async () => {
    const source = path.join(dir, 'match.mkv')
    fs.writeFileSync(source, '')
    fs.truncateSync(source, 2 * 1024 ** 3) // sparse 2 GB, over the compress threshold
    const out = await resolveUploadVideoPath(source)
    expect(out.path).toBe(path.join(dir, 'match_upforge.mp4'))
    expect(fs.readdirSync(dir).sort()).toEqual(['match.mkv', 'match_upforge.mp4', 'match_upforge.mp4.done'])
    expect(ffmpeg.calls).toHaveLength(1)
  })

  it.each([
    ['spawn ffmpeg.exe ENOENT', 'missing_tool', 'reinstall'],
    ['ENOSPC: no space left on device', 'disk_full', 'Free up disk space'],
    ['EACCES: permission denied', 'permission', 'write permission'],
    ['ffmpeg timed out after 90 minutes', 'timeout', 'timed out'],
    ['unknown encoder failure token=secret', 'encoder', 'try again'],
  ])('preserves the source and a bounded diagnostic for %s', async (detail, reason, recovery) => {
    const source = path.join(dir, 'match.mkv')
    fs.writeFileSync(source, '')
    fs.truncateSync(source, 2 * 1024 ** 3)
    ffmpeg.error = detail
    const error = await resolveUploadVideoPath(source).catch(err => err)
    expect(error.message).toContain(recovery)
    expect(error.diagnostics).toMatchObject({ stage: 'prepare', reason })
    expect(error.cause.message).not.toContain('token=secret')
    expect(error.diagnostics.detail).toBe(error.cause.message)
    expect(classifyAnalysisFailure(error.message)).toMatchObject({ canRetry: true, creditRefunded: false })
    expect(fs.existsSync(source)).toBe(true)
    expect(fs.existsSync(path.join(dir, 'match_upforge.mp4'))).toBe(false)
  })
})

it.each([
  ['/Volumes/PrivateDisk/SecretMatches/match.mkv', '/Volumes/PrivateDisk/SecretMatches/match_upforge.mp4'],
  ['D:/PrivateDisk/SecretMatches/match.mkv', 'D:/PrivateDisk/SecretMatches/match_upforge.mp4'],
  ['\\\\PrivateNas\\SecretMatches\\match.mkv', '\\\\PrivateNas\\SecretMatches\\match_upforge.mp4'],
])('redacts known recording paths outside standard user directories: %s', (source, output) => {
  const detail = `ffmpeg exited 1: error reading "${source}" and writing "${output}"; permission denied`
  const error = new RecordingPreparationError(detail, [source, output])
  expect(error.diagnostics.detail).toContain('[redacted-path]')
  expect(error.diagnostics.detail).not.toMatch(/PrivateDisk|PrivateNas|SecretMatches|match\.mkv|match_upforge/)
  expect((error.cause as Error).message).toBe(error.diagnostics.detail)
  expect(error.diagnostics.reason).toBe('permission')
})

it('redacts Windows paths when FFmpeg changes separator or drive-letter case', () => {
  const error = new RecordingPreparationError(
    'EACCES: cannot write d:\\PrivateDisk\\SecretMatches\\match_upforge.mp4 in D:/PrivateDisk/SecretMatches',
    ['D:/PrivateDisk/SecretMatches/match.mkv', 'D:/PrivateDisk/SecretMatches/match_upforge.mp4'],
  )
  expect(error.diagnostics.detail).not.toMatch(/PrivateDisk|SecretMatches|match_upforge/)
})
