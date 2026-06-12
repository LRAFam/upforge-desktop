import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import log from 'electron-log'
import type { AuthManager } from './auth-manager'
import type { PendingRecording, RecordingsStore } from './recordings-store'
import { fetchArchivePlaybackUrl, fetchRecordingPlaybackUrl } from './recording-playback'
import { deleteLocalRecordingFiles, recordingPathVariants } from './vod-compressor'
import {
  legacyGlobalRecordingsDir,
  userDataRoot,
  type LinkedRiotId,
} from './user-data-paths'
import { MIN_RECORDING_FILE_BYTES } from './recording-limits'
import { getFreeDiskSpace } from './disk-space'

export interface StorageBreakdown {
  pendingCount: number
  pendingBytes: number
  cloudBackedCount: number
  cloudBackedBytes: number
  orphanCount: number
  orphanBytes: number
  legacyDuplicateBytes: number
}

export interface StorageUsage {
  bytes: number
  count: number
  freeDiskBytes: number
  recordingsBytes: number
  recordingsCount: number
  clipsBytes: number
  clipsCount: number
  legacyRecordingsBytes: number
  orphanBytes: number
  orphanCount: number
}

export interface StorageMaintenanceResult {
  pendingPruned: number
  orphansRemoved: number
  legacyDuplicatesRemoved: number
  catalogEvicted: number
  freedBytes: number
}

function fileSizeBytes(filePath: string): number {
  try {
    return fs.statSync(filePath).size
  } catch {
    return 0
  }
}

export function isLocalOnlyRecording(rec: Pick<
  PendingRecording,
  'analysed' | 'analysisId' | 'cloudArchived' | 'archiveId'
>): boolean {
  const onCloud =
    (rec.analysed && rec.analysisId != null)
    || (rec.cloudArchived && rec.archiveId != null)
  return !onCloud
}

function scanMp4Directory(dir: string): { bytes: number; count: number; files: string[] } {
  if (!dir || !fs.existsSync(dir)) {
    return { bytes: 0, count: 0, files: [] }
  }

  let bytes = 0
  let count = 0
  const files: string[] = []

  try {
    for (const name of fs.readdirSync(dir)) {
      if (!name.toLowerCase().endsWith('.mp4')) continue
      const full = path.join(dir, name)
      try {
        const stat = fs.statSync(full)
        if (!stat.isFile() || stat.size < MIN_RECORDING_FILE_BYTES) continue
        bytes += stat.size
        count++
        files.push(full)
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }

  return { bytes, count, files }
}

function scanDirectoryBytes(dir: string): { bytes: number; count: number } {
  if (!dir || !fs.existsSync(dir)) return { bytes: 0, count: 0 }

  let bytes = 0
  let count = 0
  try {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name)
      try {
        const stat = fs.statSync(full)
        if (!stat.isFile()) continue
        bytes += stat.size
        count++
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }

  return { bytes, count }
}

function isPathKnown(filePath: string, knownPaths: Set<string>): boolean {
  const normalized = path.normalize(filePath)
  if (knownPaths.has(normalized)) return true
  for (const variant of recordingPathVariants(filePath)) {
    if (knownPaths.has(path.normalize(variant))) return true
  }
  return false
}

function listOrphanRecordingFiles(savePath: string, knownPaths: Set<string>): string[] {
  const { files } = scanMp4Directory(savePath)
  const seenStems = new Set<string>()

  return files.filter((filePath) => {
    if (isPathKnown(filePath, knownPaths)) return false

    const stem = path.basename(filePath, '.mp4').replace(/_upforge$/, '')
    const stemKey = path.join(path.dirname(filePath), stem).toLowerCase()
    if (seenStems.has(stemKey)) return false
    seenStems.add(stemKey)
    return true
  })
}

export function getStorageBreakdown(
  store: RecordingsStore,
  linkedRiot: LinkedRiotId | null,
  savePath: string,
): StorageBreakdown {
  const pending = store.getPending(linkedRiot)
  const cloudBacked = store.getCloudBackedLocal(linkedRiot)
  const known = store.getKnownPaths()
  const orphans = listOrphanRecordingFiles(savePath, known)
  const legacyDuplicateBytes = estimateLegacyDuplicateBytes(savePath)

  return {
    pendingCount: pending.length,
    pendingBytes: pending.reduce((sum, r) => sum + fileSizeBytes(r.path), 0),
    cloudBackedCount: cloudBacked.length,
    cloudBackedBytes: cloudBacked.reduce((sum, r) => sum + fileSizeBytes(r.path), 0),
    orphanCount: orphans.length,
    orphanBytes: orphans.reduce((sum, filePath) => sum + fileSizeBytes(filePath), 0),
    legacyDuplicateBytes,
  }
}

function estimateLegacyDuplicateBytes(activeSavePath: string): number {
  const legacyDir = legacyGlobalRecordingsDir()
  if (path.normalize(legacyDir) === path.normalize(activeSavePath)) return 0
  if (!fs.existsSync(legacyDir)) return 0

  let bytes = 0
  for (const name of fs.readdirSync(legacyDir)) {
    if (!name.toLowerCase().endsWith('.mp4')) continue
    const legacyPath = path.join(legacyDir, name)
    const activePath = path.join(activeSavePath, name)
    try {
      if (fs.existsSync(activePath) && fs.statSync(legacyPath).isFile()) {
        bytes += fs.statSync(legacyPath).size
      }
    } catch { /* ignore */ }
  }
  return bytes
}

export function getFullStorageUsage(
  savePath: string,
  userId: number | null,
  store: RecordingsStore | null,
): StorageUsage {
  const recordings = scanMp4Directory(savePath)
  const known = store?.getKnownPaths() ?? new Set<string>()
  const orphans = listOrphanRecordingFiles(savePath, known)

  const legacyDir = legacyGlobalRecordingsDir()
  const legacyRecordingsBytes =
    path.normalize(legacyDir) !== path.normalize(savePath)
      ? scanMp4Directory(legacyDir).bytes
      : 0

  const clipDirs = new Set<string>()
  if (userId != null) clipDirs.add(path.join(userDataRoot(userId), 'clips'))
  clipDirs.add(path.join(app.getPath('userData'), 'clips'))

  let clipsBytes = 0
  let clipsCount = 0
  for (const dir of clipDirs) {
    const scan = scanDirectoryBytes(dir)
    clipsBytes += scan.bytes
    clipsCount += scan.count
  }

  const orphanBytes = orphans.reduce((sum, filePath) => sum + fileSizeBytes(filePath), 0)
  const totalBytes = recordings.bytes + legacyRecordingsBytes + clipsBytes

  return {
    bytes: totalBytes,
    count: recordings.count + clipsCount,
    freeDiskBytes: 0, // filled by caller via getFreeDiskSpace
    recordingsBytes: recordings.bytes,
    recordingsCount: recordings.count,
    clipsBytes,
    clipsCount,
    legacyRecordingsBytes,
    orphanBytes,
    orphanCount: orphans.length,
  }
}

export async function buildStorageUsage(
  savePath: string,
  userId: number | null,
  store: RecordingsStore | null,
): Promise<StorageUsage> {
  const usage = getFullStorageUsage(savePath, userId, store)
  usage.freeDiskBytes = await getFreeDiskSpace(savePath)
  return usage
}

/** Remove legacy global recordings that were copied into the active user folder. */
export function cleanupLegacyRecordingDuplicates(activeSavePath: string): { removed: number; freedBytes: number } {
  const legacyDir = legacyGlobalRecordingsDir()
  if (path.normalize(legacyDir) === path.normalize(activeSavePath)) {
    return { removed: 0, freedBytes: 0 }
  }
  if (!fs.existsSync(legacyDir)) return { removed: 0, freedBytes: 0 }

  let removed = 0
  let freedBytes = 0

  for (const name of fs.readdirSync(legacyDir)) {
    if (!name.toLowerCase().endsWith('.mp4')) continue
    const legacyPath = path.join(legacyDir, name)
    const activePath = path.join(activeSavePath, name)
    if (!fs.existsSync(activePath)) continue

    try {
      freedBytes += deleteLocalRecordingFiles(legacyPath)
      removed++
      log.info(`[StorageCleanup] Removed legacy duplicate: ${legacyPath}`)
    } catch (err) {
      log.warn(`[StorageCleanup] Failed to remove legacy duplicate ${legacyPath}:`, err)
    }
  }

  return { removed, freedBytes }
}

export function purgeUntrackedRecordingFiles(
  store: RecordingsStore,
  savePath: string,
  maxAgeDays = 0,
): { removed: number; freedBytes: number } {
  const known = store.getKnownPaths()
  const cutoff = maxAgeDays > 0 ? Date.now() - maxAgeDays * 24 * 60 * 60 * 1000 : 0
  let removed = 0
  let freedBytes = 0

  for (const filePath of listOrphanRecordingFiles(savePath, known)) {
    if (maxAgeDays > 0) {
      try {
        if (fs.statSync(filePath).mtimeMs >= cutoff) continue
      } catch {
        continue
      }
    }

    try {
      freedBytes += deleteLocalRecordingFiles(filePath)
      removed++
      log.info(`[StorageCleanup] Removed untracked recording: ${filePath}`)
    } catch (err) {
      log.warn(`[StorageCleanup] Failed to remove untracked ${filePath}:`, err)
    }
  }

  return { removed, freedBytes }
}

export function prunePendingRecordingsByAge(
  store: RecordingsStore,
  days: number,
  linkedRiot: LinkedRiotId | null,
): { removed: number; freedBytes: number } {
  if (days <= 0) return { removed: 0, freedBytes: 0 }

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  let removed = 0
  let freedBytes = 0

  for (const rec of store.getPending(linkedRiot)) {
    if (!isLocalOnlyRecording(rec)) continue
    if (rec.recordedAt >= cutoff) continue
    if (!fs.existsSync(rec.path)) {
      store.remove(rec.id)
      removed++
      continue
    }

    try {
      freedBytes += deleteLocalRecordingFiles(rec.path)
      store.remove(rec.id)
      removed++
      log.info(`[StorageCleanup] Pruned aged pending recording: ${rec.path}`)
    } catch (err) {
      log.warn(`[StorageCleanup] Failed to prune pending ${rec.path}:`, err)
    }
  }

  return { removed, freedBytes }
}


export function runRecordingStorageMaintenance(opts: {
  store: RecordingsStore
  savePath: string
  recordingRetentionDays: number
  linkedRiot: LinkedRiotId | null
}): StorageMaintenanceResult {
  const legacy = cleanupLegacyRecordingDuplicates(opts.savePath)
  const pending = prunePendingRecordingsByAge(
    opts.store,
    opts.recordingRetentionDays,
    opts.linkedRiot,
  )
  const orphans = purgeUntrackedRecordingFiles(
    opts.store,
    opts.savePath,
    opts.recordingRetentionDays,
  )

  const freedBytes = legacy.freedBytes + pending.freedBytes + orphans.freedBytes
  const result: StorageMaintenanceResult = {
    pendingPruned: pending.removed,
    orphansRemoved: orphans.removed,
    legacyDuplicatesRemoved: legacy.removed,
    catalogEvicted: 0,
    freedBytes,
  }

  const totalRemoved =
    legacy.removed + pending.removed + orphans.removed
  if (totalRemoved > 0) {
    log.info(
      `[StorageCleanup] Maintenance freed ${(freedBytes / (1024 ** 3)).toFixed(2)} GB ` +
      `(${legacy.removed} legacy dupes, ${pending.removed} aged pending, ${orphans.removed} untracked)`,
    )
  }

  return result
}

export async function purgeCloudBackedLocals(
  store: RecordingsStore,
  auth: AuthManager,
  linkedRiot: LinkedRiotId | null,
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
      freedBytes += deleteLocalRecordingFiles(rec.path)
      removed++
      log.info(`[StorageCleanup] Removed cloud-backed local file: ${rec.path} (${size} bytes)`)
    } catch (err) {
      log.warn(`[StorageCleanup] Failed to delete ${rec.path}:`, err)
      skipped++
    }
  }

  return { freedBytes, removed, skipped }
}
