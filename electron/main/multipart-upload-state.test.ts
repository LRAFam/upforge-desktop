import { describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  clearMultipartState,
  multipartStatePath,
  readMultipartState,
  withCompletedPart,
  writeMultipartState,
  type MultipartResumeState,
} from './multipart-upload-state'

describe('multipart-upload-state', () => {
  it('reads and writes resume state', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'upforge-mp-'))
    try {
      const file = multipartStatePath(dir, 'rec-1')
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
})
