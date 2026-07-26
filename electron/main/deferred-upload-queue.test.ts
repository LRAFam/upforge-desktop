import { describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  addDeferredUploadId,
  getDeferredUploadQueuePath,
  readDeferredUploadIds,
  removeDeferredUploadId,
} from './deferred-upload-queue'

describe('deferred-upload-queue', () => {
  it('persists and removes recording ids', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'upforge-defer-'))
    try {
      const file = getDeferredUploadQueuePath(dir)
      expect(readDeferredUploadIds(file)).toEqual([])
      addDeferredUploadId(file, 'a')
      addDeferredUploadId(file, 'b')
      addDeferredUploadId(file, 'a')
      expect(readDeferredUploadIds(file).sort()).toEqual(['a', 'b'])
      removeDeferredUploadId(file, 'a')
      expect(readDeferredUploadIds(file)).toEqual(['b'])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
