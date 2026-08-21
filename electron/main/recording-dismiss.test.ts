import { describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp' },
  BrowserWindow: class {},
}))

vi.mock('electron-log', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('./vod-compressor', () => ({
  recordingPathVariants: (p: string) => [p],
  sourcePathForCompressed: () => null,
  deleteLocalRecordingFiles: vi.fn(),
}))

import { applyRecordingDismiss } from './recording-dismiss'
import type { PendingRecording } from '../../src/env'

function makeFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upforge-dismiss-'))
  const file = path.join(dir, 'vod.mp4')
  fs.writeFileSync(file, 'x'.repeat(2048))
  return file
}

describe('applyRecordingDismiss', () => {
  it('remove deletes local file and removes catalog for local-only', () => {
    const file = makeFile()
    const rec = {
      id: 'r1',
      path: file,
      clipsOnly: false,
    } as PendingRecording
    const store = {
      getById: (id: string) => (id === 'r1' ? rec : undefined),
      remove: (id: string) => { expect(id).toBe('r1'); (rec as { gone?: boolean }).gone = true },
      clearLocalPath: () => false,
      setMatchStatsSyncPaused: () => false,
    }
    const result = applyRecordingDismiss(store, 'r1', {
      mode: 'remove',
      deleteFiles: (p) => {
        fs.unlinkSync(p)
        return 2048
      },
    })
    expect(result).toEqual({
      ok: true,
      deletedLocal: true,
      freedBytes: 2048,
      removedFromLibrary: true,
    })
    expect(fs.existsSync(file)).toBe(false)
  })

  it('localOnly deletes file, keeps catalog, clears path', () => {
    const file = makeFile()
    const rec = {
      id: 'r2',
      path: file,
      clipsOnly: false,
      archiveId: 'arch',
      cloudArchived: true,
    } as PendingRecording
    let cleared = false
    let syncPaused = false
    const store = {
      getById: () => rec,
      remove: () => { throw new Error('should not remove') },
      clearLocalPath: (id: string) => {
        expect(id).toBe('r2')
        cleared = true
        rec.path = ''
        return true
      },
      setMatchStatsSyncPaused: (id: string, paused: boolean) => {
        expect(id).toBe('r2')
        syncPaused = paused
        return true
      },
    }
    const result = applyRecordingDismiss(store, 'r2', {
      mode: 'localOnly',
      deleteFiles: (p) => {
        fs.unlinkSync(p)
        return 100
      },
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.removedFromLibrary).toBe(false)
      expect(result.deletedLocal).toBe(true)
    }
    expect(cleared).toBe(true)
    expect(syncPaused).toBe(true)
  })

  it('localOnly rejects local-only recordings', () => {
    const store = {
      getById: () => ({ id: 'r3', path: '/x', clipsOnly: false } as PendingRecording),
      remove: () => {},
      clearLocalPath: () => false,
      setMatchStatsSyncPaused: () => false,
    }
    const result = applyRecordingDismiss(store, 'r3', {
      mode: 'localOnly',
      deleteFiles: () => 0,
    })
    expect(result.ok).toBe(false)
  })
})
