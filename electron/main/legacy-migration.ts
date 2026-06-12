import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import log from 'electron-log'
import { getFreeDiskSpace } from './disk-space'
import { legacyGlobalRecordingsDir, userDataRoot, userRecordingsDir } from './user-data-paths'

/** Move when possible; copy+unlink only if cross-volume (EXDEV). */
function migrateFile(src: string, dest: string): 'moved' | 'skipped' | 'failed' {
  if (!fs.existsSync(src)) return 'skipped'

  try {
    if (fs.existsSync(dest)) {
      const srcSize = fs.statSync(src).size
      const destSize = fs.statSync(dest).size
      if (srcSize === destSize) {
        fs.unlinkSync(src)
        return 'moved'
      }
      return 'skipped'
    }

    fs.mkdirSync(path.dirname(dest), { recursive: true })
    try {
      fs.renameSync(src, dest)
      return 'moved'
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code !== 'EXDEV') throw err
      fs.copyFileSync(src, dest)
      fs.unlinkSync(src)
      return 'moved'
    }
  } catch (err) {
    log.warn(`[UserSession] Failed to migrate ${src}:`, err)
    return 'failed'
  }
}

function migrateJsonFile(legacy: string, target: string): void {
  if (!fs.existsSync(legacy) || fs.existsSync(target)) return
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.renameSync(legacy, target)
    log.info(`[UserSession] Migrated ${path.basename(legacy)} → users/`)
  } catch {
    try {
      fs.copyFileSync(legacy, target)
      fs.unlinkSync(legacy)
    } catch (err) {
      log.warn(`[UserSession] Failed to migrate ${legacy}:`, err)
    }
  }
}

async function estimateMigrationBytes(legacyRecordingsDir: string): Promise<number> {
  if (!fs.existsSync(legacyRecordingsDir)) return 0
  let bytes = 0
  for (const name of fs.readdirSync(legacyRecordingsDir)) {
    const full = path.join(legacyRecordingsDir, name)
    try {
      const stat = fs.statSync(full)
      if (stat.isFile()) bytes += stat.size
    } catch { /* ignore */ }
  }
  return bytes
}

/**
 * Move legacy global data into the per-user folder (same volume = rename, not copy).
 * Runs asynchronously so login is not blocked on large libraries.
 */
export function scheduleLegacyUserDataMigration(
  userId: number,
  onComplete?: () => void,
): void {
  void (async () => {
    const userData = app.getPath('userData')
    const root = userDataRoot(userId)
    fs.mkdirSync(root, { recursive: true })

    migrateJsonFile(path.join(userData, 'clips.json'), path.join(root, 'clips.json'))
    migrateJsonFile(path.join(userData, 'recordings.json'), path.join(root, 'recordings.json'))

    const legacyClipsDir = path.join(userData, 'clips')
    const targetClipsDir = path.join(root, 'clips')
    if (fs.existsSync(legacyClipsDir) && !fs.existsSync(targetClipsDir)) {
      try {
        fs.renameSync(legacyClipsDir, targetClipsDir)
        log.info('[UserSession] Migrated clips/ → users/ (move)')
      } catch {
        try {
          fs.cpSync(legacyClipsDir, targetClipsDir, { recursive: true })
          fs.rmSync(legacyClipsDir, { recursive: true, force: true })
        } catch (err) {
          log.warn('[UserSession] Failed to migrate clips directory:', err)
        }
      }
    }

    const legacyRecordingsDir = path.join(userData, 'recordings')
    const targetRecordingsDir = userRecordingsDir(userId)
    if (!fs.existsSync(legacyRecordingsDir)) {
      onComplete?.()
      return
    }

    const pendingBytes = await estimateMigrationBytes(legacyRecordingsDir)
    const freeBytes = await getFreeDiskSpace(targetRecordingsDir)
    if (pendingBytes > 0 && freeBytes < pendingBytes + 512 * 1024 * 1024) {
      log.error(
        `[UserSession] Skipping recording migration — need ~${(pendingBytes / (1024 ** 3)).toFixed(1)} GB ` +
        `but only ${(freeBytes / (1024 ** 3)).toFixed(1)} GB free. Move or delete files in ${legacyRecordingsDir}`,
      )
      onComplete?.()
      return
    }

    fs.mkdirSync(targetRecordingsDir, { recursive: true })
    let moved = 0
    let failed = 0

    for (const name of fs.readdirSync(legacyRecordingsDir)) {
      const src = path.join(legacyRecordingsDir, name)
      const dest = path.join(targetRecordingsDir, name)
      if (!fs.statSync(src).isFile()) continue
      const result = migrateFile(src, dest)
      if (result === 'moved') moved++
      else if (result === 'failed') failed++
    }

    if (moved > 0) {
      log.info(`[UserSession] Migrated ${moved} recording(s) → users/${userId}/recordings/ (move)`)
    }
    if (failed > 0) {
      log.warn(`[UserSession] ${failed} recording(s) could not be migrated — see logs above`)
    }

    try {
      const remaining = fs.readdirSync(legacyRecordingsDir)
      if (remaining.length === 0) {
        fs.rmdirSync(legacyRecordingsDir)
      }
    } catch { /* ignore */ }

    onComplete?.()
  })()
}

/** Point settings at the per-user folder when still on the legacy global path. */
export function normalizeLegacySavePath(
  settingsSavePath: string | undefined,
  userId: number,
): string | null {
  const legacy = legacyGlobalRecordingsDir()
  const trimmed = String(settingsSavePath ?? '').trim()
  const perUser = userRecordingsDir(userId)
  if (!trimmed || path.normalize(trimmed) === path.normalize(legacy)) {
    return perUser
  }
  return null
}
