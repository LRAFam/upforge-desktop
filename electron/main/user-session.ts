import { app, BrowserWindow } from 'electron'
import fs from 'fs'
import path from 'path'
import log from 'electron-log'
import type { ClipStore } from './clip-store'
import type { RecordingsStore } from './recordings-store'
import type { SettingsManager, AppSettings } from './settings-manager'
import { setClipsMediaDir } from './clip-extractor'
import {
  clearPendingJobForUser,
  readPendingJobForUser,
  setPendingJobUserScope,
} from './upload-manager'
import { userDataRoot, userOverlayPath, userRecordingsDir } from './user-data-paths'

export { userDataRoot } from './user-data-paths'

let activeUserId: number | null = null

export function getActiveUserId(): number | null {
  return activeUserId
}

function persistUserOverlay(userId: number, settings: SettingsManager): void {
  try {
    const root = userDataRoot(userId)
    fs.mkdirSync(root, { recursive: true })
    const overlay = { lastInsight: settings.get().lastInsight ?? null }
    fs.writeFileSync(userOverlayPath(userId), JSON.stringify(overlay, null, 2))
  } catch (err) {
    log.warn('[UserSession] Failed to persist user overlay:', err)
  }
}

function loadUserOverlay(userId: number, settings: SettingsManager): void {
  try {
    const raw = fs.readFileSync(userOverlayPath(userId), 'utf-8')
    const parsed = JSON.parse(raw) as { lastInsight?: AppSettings['lastInsight'] }
    settings.save({ lastInsight: parsed.lastInsight ?? null })
  } catch {
    settings.save({ lastInsight: null })
  }
}

/** Move legacy global clips/recordings into the first logged-in user's folder. */
export function migrateLegacyUserData(userId: number): void {
  const userData = app.getPath('userData')
  const root = userDataRoot(userId)
  fs.mkdirSync(root, { recursive: true })

  const pairs: Array<{ legacy: string; target: string }> = [
    { legacy: path.join(userData, 'clips.json'), target: path.join(root, 'clips.json') },
    { legacy: path.join(userData, 'recordings.json'), target: path.join(root, 'recordings.json') },
  ]

  for (const { legacy, target } of pairs) {
    if (fs.existsSync(legacy) && !fs.existsSync(target)) {
      try {
        fs.copyFileSync(legacy, target)
        log.info(`[UserSession] Migrated ${path.basename(legacy)} → users/${userId}/`)
      } catch (err) {
        log.warn(`[UserSession] Failed to migrate ${legacy}:`, err)
      }
    }
  }

  const legacyClipsDir = path.join(userData, 'clips')
  const targetClipsDir = path.join(root, 'clips')
  if (fs.existsSync(legacyClipsDir) && !fs.existsSync(targetClipsDir)) {
    try {
      fs.cpSync(legacyClipsDir, targetClipsDir, { recursive: true })
      log.info(`[UserSession] Migrated clips/ → users/${userId}/clips/`)
    } catch (err) {
      log.warn('[UserSession] Failed to migrate clips directory:', err)
    }
  }

  const legacyRecordingsDir = path.join(userData, 'recordings')
  const targetRecordingsDir = userRecordingsDir(userId)
  if (fs.existsSync(legacyRecordingsDir)) {
    try {
      fs.mkdirSync(targetRecordingsDir, { recursive: true })
      let copied = 0
      for (const name of fs.readdirSync(legacyRecordingsDir)) {
        const src = path.join(legacyRecordingsDir, name)
        const dest = path.join(targetRecordingsDir, name)
        if (fs.statSync(src).isFile() && !fs.existsSync(dest)) {
          fs.copyFileSync(src, dest)
          copied++
        } else if (fs.statSync(src).isFile() && fs.existsSync(dest)) {
          try {
            fs.unlinkSync(src)
            log.info(`[UserSession] Removed legacy duplicate recording: ${name}`)
          } catch (err) {
            log.warn(`[UserSession] Failed to remove legacy duplicate ${src}:`, err)
          }
        }
      }
      if (copied > 0) {
        log.info(`[UserSession] Migrated ${copied} recording(s) → users/${userId}/recordings/`)
      }
    } catch (err) {
      log.warn('[UserSession] Failed to migrate recordings directory:', err)
    }
  }
}

export interface UserSessionDeps {
  clipStore: ClipStore
  recordingsStore: RecordingsStore
  settingsManager: SettingsManager
  getMainWindow: () => BrowserWindow | null
  onScopeChanged?: () => void
}

export function activateUserSession(userId: number, deps: UserSessionDeps): void {
  if (activeUserId === userId) return

  if (activeUserId != null) {
    persistUserOverlay(activeUserId, deps.settingsManager)
  }

  migrateLegacyUserData(userId)
  activeUserId = userId
  setPendingJobUserScope(userId)

  fs.mkdirSync(userRecordingsDir(userId), { recursive: true })
  deps.clipStore.setUserScope(userId)
  deps.recordingsStore.setUserScope(userId)
  setClipsMediaDir(deps.clipStore.getClipsMediaDir())
  loadUserOverlay(userId, deps.settingsManager)

  deps.onScopeChanged?.()
  deps.getMainWindow()?.webContents.send('session:user-changed', { userId })
  log.info(`[UserSession] Activated scope for user ${userId}`)
}

export function clearUserSession(deps: UserSessionDeps): void {
  if (activeUserId != null) {
    persistUserOverlay(activeUserId, deps.settingsManager)
  }

  activeUserId = null
  setPendingJobUserScope(null)
  deps.clipStore.setUserScope(null)
  deps.recordingsStore.setUserScope(null)
  setClipsMediaDir(null)
  deps.settingsManager.save({ lastInsight: null })

  deps.onScopeChanged?.()
  deps.getMainWindow()?.webContents.send('session:user-changed', { userId: null })
  log.info('[UserSession] Cleared user scope')
}

export function readActivePendingJob() {
  return readPendingJobForUser(activeUserId)
}

export function clearActivePendingJob(): void {
  clearPendingJobForUser(activeUserId)
}
