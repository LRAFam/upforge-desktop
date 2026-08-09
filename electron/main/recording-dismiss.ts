import type { PendingRecording } from '../../src/env'
import { hasCloudRecording } from './recordings-store'

export type RecordingDismissMode = 'remove' | 'localOnly'

export interface RecordingDismissStore {
  getById(id: string): PendingRecording | undefined
  remove(id: string): void
  clearLocalPath(id: string): boolean
}

export type RecordingDismissResult =
  | { ok: true; deletedLocal: boolean; freedBytes: number; removedFromLibrary: boolean }
  | { ok: false; error: string }

export function applyRecordingDismiss(
  store: RecordingDismissStore,
  id: string,
  opts: {
    mode: RecordingDismissMode
    /** When mode is remove, default true. */
    deleteLocalFiles?: boolean
    deleteFiles: (filePath: string) => number
  },
): RecordingDismissResult {
  const recording = store.getById(id)
  if (!recording) return { ok: false, error: 'Recording not found' }

  if (opts.mode === 'localOnly') {
    if (!hasCloudRecording(recording)) {
      return { ok: false, error: 'Local-only recordings must be removed from the library' }
    }
    if (!recording.path) {
      return { ok: false, error: 'No local file to delete' }
    }
    const freedBytes = opts.deleteFiles(recording.path)
    store.clearLocalPath(id)
    return { ok: true, deletedLocal: true, freedBytes, removedFromLibrary: false }
  }

  // mode === 'remove'
  let freedBytes = 0
  let deletedLocal = false
  const shouldDelete = opts.deleteLocalFiles !== false
  if (shouldDelete && recording.path && !recording.clipsOnly) {
    freedBytes = opts.deleteFiles(recording.path)
    deletedLocal = true
  }
  store.remove(id)
  return { ok: true, deletedLocal, freedBytes, removedFromLibrary: true }
}
