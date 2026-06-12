import fs from 'fs'
import log from 'electron-log'
import type { AuthManager } from './auth-manager'
import type { RecordingsStore } from './recordings-store'
import { fetchArchivePlaybackUrl, fetchRecordingPlaybackUrl } from './recording-playback'
import { deleteCompressedSibling } from './vod-compressor'
import type { LinkedRiotId } from './user-data-paths'

export interface StorageBreakdown {
  pendingCount: number
  pendingBytes: number
  cloudBackedCount: number
  cloudBackedBytes: number
}

function fileSizeBytes(filePath: string): number {
  try {
    return fs.statSync(filePath).size
  } catch {
    return 0
  }
}

export function getStorageBreakdown(
  store: RecordingsStore,
  linkedRiot: LinkedRiotId | null,
): StorageBreakdown {
  const pending = store.getPending(linkedRiot)
  const cloudBacked = store.getCloudBackedLocal(linkedRiot)
  return {
    pendingCount: pending.length,
    pendingBytes: pending.reduce((sum, r) => sum + fileSizeBytes(r.path), 0),
    cloudBackedCount: cloudBacked.length,
    cloudBackedBytes: cloudBacked.reduce((sum, r) => sum + fileSizeBytes(r.path), 0),
  }
}

export async function purgeCloudBackedLocals(
  store: RecordingsStore,
  auth: AuthManager,
  linkedRiot: LinkedRiotId | null,
  deleteRecording: (filePath: string) => void,
): Promise<{ freedBytes: number; removed: number; skipped: number }> {
  let freedBytes = 0
  let removed = 0
  let skipped = 0

  for (const rec of store.getCloudBackedLocal(linkedRiot)) {
    let url: string | null = null
    if (rec.analysisId != null) {
      url = await fetchRecordingPlaybackUrl(auth, rec.analysisId)
    } else if (rec.archiveId) {
      url = await fetchArchivePlaybackUrl(auth, rec.archiveId)
    } else {
      skipped++
      continue
    }
    if (!url) {
      log.warn(`[StorageCleanup] No cloud URL for recording ${rec.id} — keeping local file`)
      skipped++
      continue
    }
    const size = fileSizeBytes(rec.path)
    try {
      deleteRecording(rec.path)
      deleteCompressedSibling(rec.path)
      freedBytes += size
      removed++
      log.info(`[StorageCleanup] Removed cloud-backed local file: ${rec.path}`)
    } catch (err) {
      log.warn(`[StorageCleanup] Failed to delete ${rec.path}:`, err)
      skipped++
    }
  }

  return { freedBytes, removed, skipped }
}
