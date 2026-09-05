import type { IpcMain } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { setupStorageHandlers, type StorageIpcDeps } from './storage-ipc'

vi.mock('fs', () => ({ default: { existsSync: (p: string) => p !== 'missing' } }))
vi.mock('../storage-cleanup', () => ({}))
vi.mock('../storage-stats', () => ({}))
vi.mock('electron-log', () => ({ default: { warn: vi.fn() } }))

describe('cloud-only bulk backup', () => {
  it('backs up failed local footage, skips cloud and active jobs, and keeps local copies', async () => {
    const handlers = new Map<string, () => Promise<unknown>>()
    const backup = vi.fn<StorageIpcDeps['doUploadArchiveOnly']>(async () => ({ archiveId: 'saved', lastError: null }))
    const base = { path: 'video.mp4', game: 'valorant', analysed: false }
    const deps = {
      recordingsStore: { getPending: () => [
        { ...base, id: 'failed', lastAnalysisError: 'upload_stalled' },
        { ...base, id: 'archived', archiveId: 'cloud-id' },
        { ...base, id: 'uploaded', jobId: 'job-id' },
        { ...base, id: 'active', pipelineStatus: 'uploading' },
        { ...base, id: 'missing', path: 'missing' },
      ] },
      authManager: { getUser: () => ({}) },
      getMainWindow: () => ({ isDestroyed: () => false, webContents: { send: vi.fn() } }),
      linkedRiotFromAuth: () => null,
      logActivity: vi.fn(),
      doUploadArchiveOnly: backup,
    } as unknown as StorageIpcDeps
    setupStorageHandlers({ handle: (key: string, fn: () => Promise<unknown>) => handlers.set(key, fn) } as unknown as IpcMain, deps)
    expect(await handlers.get('storage:upload-pending')!()).toMatchObject({ uploaded: 1, failed: 0 })
    expect(backup).toHaveBeenCalledTimes(1)
    expect(backup.mock.calls[0]?.[0]).toBe('failed')
    expect(backup.mock.calls[0]?.[9]).toBe(false)
  })
})
