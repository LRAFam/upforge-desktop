import { describe, expect, it, vi } from 'vitest'
import { mkdtemp, writeFile, utimes, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

vi.mock('electron-log', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('./vod-compressor', () => ({
  compressedPathFor: (p: string) => p.replace(/\.mkv$/i, '_upforge.mp4'),
  recordingPathVariants: (p: string) => [p],
  sourcePathForCompressed: () => null,
}))

import { MIN_RECORDING_FILE_BYTES } from './recording-limits'
import {
  listUnregisteredRecordingFiles,
  resolveReadyRecordingPathDetailed,
} from './recording-path-resolver'

async function writeSized(file: string, bytes: number, mtimeMs: number): Promise<void> {
  await writeFile(file, Buffer.alloc(bytes, 1))
  const at = new Date(mtimeMs)
  await utimes(file, at, at)
}

describe('resolveReadyRecordingPathDetailed', () => {
  it('uses preferred path without fallback', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'upforge-path-'))
    try {
      const preferred = join(dir, 'match.mp4')
      const now = Date.now()
      await writeSized(preferred, MIN_RECORDING_FILE_BYTES + 10, now)
      const result = resolveReadyRecordingPathDetailed(preferred, dir, now - 1_000)
      expect(result.usedFallback).toBe(false)
      expect(result.file?.path).toBe(preferred)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('rejects stale large files outside the fallback window', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'upforge-path-'))
    try {
      const now = Date.now()
      const stale = join(dir, 'old-huge.mp4')
      await writeSized(stale, MIN_RECORDING_FILE_BYTES * 50, now - 120_000)

      const missingPreferred = join(dir, 'missing-from-obs.mp4')
      const result = resolveReadyRecordingPathDetailed(missingPreferred, dir, now)
      expect(result.file).toBeNull()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('picks newest fresh fallback when preferred is missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'upforge-path-'))
    try {
      const now = Date.now()
      await writeSized(join(dir, 'older.mp4'), MIN_RECORDING_FILE_BYTES * 10, now - 10_000)
      await writeSized(join(dir, 'newer.mp4'), MIN_RECORDING_FILE_BYTES + 5, now - 2_000)

      const result = resolveReadyRecordingPathDetailed(
        join(dir, 'gone.mp4'),
        dir,
        now,
      )
      expect(result.usedFallback).toBe(true)
      expect(result.file?.path).toContain('newer.mp4')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('listUnregisteredRecordingFiles', () => {
  it('finds a finished recording that appeared after an earlier empty scan', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'upforge-orphan-'))
    try {
      const now = Date.now()
      expect(listUnregisteredRecordingFiles(dir, new Set(), now - 60_000)).toEqual([])

      const recording = join(dir, 'finished-match.mp4')
      await writeSized(recording, MIN_RECORDING_FILE_BYTES + 10, now)

      expect(listUnregisteredRecordingFiles(dir, new Set(), now - 60_000)).toEqual([
        { path: recording, sizeBytes: MIN_RECORDING_FILE_BYTES + 10 },
      ])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('does not import a persisted non-gameplay OBS recording', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'upforge-orphan-'))
    try {
      const now = Date.now()
      const marketing = join(dir, 'marketing.mp4')
      await writeSized(marketing, MIN_RECORDING_FILE_BYTES + 10, now)

      expect(listUnregisteredRecordingFiles(
        dir,
        new Set([marketing]),
        now - 60_000,
      )).toEqual([])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
