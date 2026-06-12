import { app, BrowserWindow } from 'electron'
import fs from 'fs'
import path from 'path'
import log from 'electron-log'
import type { ClipStore } from './clip-store'
import type { RecordingsStore } from './recordings-store'
import type { SettingsManager } from './settings-manager'
import { setClipsMediaDir } from './clip-extractor'
import {
  clearPendingJobForUser,
  readPendingJobForUser,
  setPendingJobUserScope,
} from './upload-manager'
import { userDataRoot, userOverlayPath, userRecordingsDir } from './user-data-paths'
import { normalizeLegacySavePath, scheduleLegacyUserDataMigration } from './legacy-migration'

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
    const parsed = JSON.parse(raw) as { lastInsight?: import('./settings-manager').AppSettings['lastInsight'] }
    settings.save({ lastInsight: parsed.lastInsight ?? null })
  } catch {
    settings.save({ lastInsight: null })
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

  activeUserId = userId
  setPendingJobUserScope(userId)

  const updatedSavePath = normalizeLegacySavePath(deps.settingsManager.get().savePath, userId)
  if (updatedSavePath) {
    deps.settingsManager.save({ savePath: updatedSavePath })
    log.info(`[UserSession] Updated savePath → ${updatedSavePath}`)
  }

  fs.mkdirSync(userRecordingsDir(userId), { recursive: true })
  deps.clipStore.setUserScope(userId)
  deps.recordingsStore.setUserScope(userId)
  setClipsMediaDir(deps.clipStore.getClipsMediaDir())
  loadUserOverlay(userId, deps.settingsManager)

  scheduleLegacyUserDataMigration(userId, () => {
    deps.onScopeChanged?.()
    deps.getMainWindow()?.webContents.send('recordings:updated')
  })

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
