import { describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  clearMultipartState,
  multipartStatePath,
  readMultipartState,
  serverCompletedParts,
  withCompletedPart,
  writeMultipartState,
  type MultipartResumeState,
} from './multipart-upload-state'

describe('multipart-upload-state', () => {
  it('reads and writes resume state', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'upforge-mp-'))
    try {
      const file = multipartStatePath(dir, 'rec-1', 1)
      const state: MultipartResumeState = {
        version: 1,
        recordingId: 'rec-1',
        jobId: 'job-1',
        uploadId: 'upload-xyz',
        partSize: 8_000_000,
        totalBytes: 20_000_000,
        completedParts: [{ part_number: 1, etag: '"abc"' }],
        updatedAt: Date.now(),
      }
      writeMultipartState(file, state)
      const loaded = readMultipartState(file)
      expect(loaded?.uploadId).toBe('upload-xyz')
      expect(loaded?.completedParts).toHaveLength(1)

      const merged = withCompletedPart(loaded!, { part_number: 2, etag: '"def"' })
      writeMultipartState(file, merged)
      expect(readMultipartState(file)?.completedParts.map((p) => p.part_number)).toEqual([1, 2])

      clearMultipartState(file)
      expect(readMultipartState(file)).toBeNull()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('isolates the same recording key between accounts', () => {
    expect(multipartStatePath('/data', 'same', 1)).not.toBe(multipartStatePath('/data', 'same', 2))
    expect(multipartStatePath('/data', 'same', 1)).not.toBe(multipartStatePath('/data', 'same', null))
  })

  it('accepts only valid authoritative parts and does not infer missing server progress', () => {
    expect(serverCompletedParts(undefined, 2)).toEqual([])
    expect(serverCompletedParts([], 2)).toEqual([])
    expect(serverCompletedParts([{ part_number: 2, etag: 'server' }], 2)).toEqual([{ part_number: 2, etag: 'server' }])
    for (const value of [null, [{ part_number: 3, etag: 'x' }], [{ part_number: 1, etag: '' }],
      [{ part_number: 1, etag: 'a' }, { part_number: 1, etag: 'b' }]]) {
      expect(() => serverCompletedParts(value, 2)).toThrow('Invalid uploaded_parts')
    }
  })
})
