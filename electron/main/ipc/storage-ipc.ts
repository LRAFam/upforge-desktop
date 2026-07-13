/**
 * storage-ipc.ts
 * IPC handlers for local/cloud storage management: usage breakdown, estimates,
 * orphan purging, cloud-backed cleanup, and bulk upload of pending recordings.
 *
 * Extracted from index.ts. Runtime state (windows, stores, save path) is passed
 * in via the deps object so this module stays free of module-level singletons.
 */

import type { BrowserWindow, IpcMain } from 'electron'
import log from 'electron-log'
import type { AuthManager } from '../auth-manager'
import type { SettingsManager } from '../settings-manager'
import type { RecordingsStore } from '../recordings-store'
import type { MatchData } from '../riot-types'
import { UpgradeRequiredError } from '../errors'
import {
  getStorageBreakdown,
  purgeCloudBackedLocals,
  buildStorageUsage,
  purgeUntrackedRecordingFiles,
} from '../storage-cleanup'
import { buildStorageEstimate } from '../storage-stats'

export interface StorageIpcDeps {
  recordingsStore: RecordingsStore
  authManager: AuthManager
  settingsManager: SettingsManager | undefined
  getMainWindow: () => BrowserWindow | null
  getActiveUserId: () => number | null
  linkedRiotFromAuth: () => { name: string; tag: string } | null
  recordingSavePath: () => string
  logActivity: (message: string) => void
  doUploadArchiveOnly: (
    recordingId: string | null,
    videoPath: string,
    riotName: string,
    riotTag: string,
    game: string,
    map: string | null,
    agent: string | null,
    timeline: MatchData | null,
    targetWindow: BrowserWindow,
    deleteLocalAfterUpload?: boolean,
  ) => Promise<string | null>
}

export function setupStorageHandlers(ipcMain: IpcMain, deps: StorageIpcDeps): void {
  const {
    recordingsStore,
    authManager,
    settingsManager,
    getMainWindow,
    getActiveUserId,
    linkedRiotFromAuth,
    recordingSavePath,
    logActivity,
    doUploadArchiveOnly,
  } = deps

  let bulkPendingUploadRunning = false

  ipcMain.handle('storage:get-breakdown', () => {
    return getStorageBreakdown(
      recordingsStore,
      linkedRiotFromAuth(),
      recordingSavePath(),
    )
  })

  ipcMain.handle('storage:get-usage', async () => {
    const savePath = recordingSavePath()
    return buildStorageUsage(savePath, getActiveUserId(), recordingsStore)
  })

  ipcMain.handle('storage:get-estimate', () => {
    const savePath = recordingSavePath()
    const settings = settingsManager?.get()
    if (!settings) {
      return buildStorageEstimate(savePath, {
        recordingPreset: 'coaching',
        recordingBitrate: 5,
        fullMatchRecording: true,
      })
    }
    return buildStorageEstimate(savePath, settings)
  })

  ipcMain.handle('storage:purge-orphans', () => {
    const result = purgeUntrackedRecordingFiles(recordingsStore, recordingSavePath(), 0)
    const mainWindow = getMainWindow()
    mainWindow?.webContents.send('recordings:updated')
    mainWindow?.webContents.send('dashboard:refresh')
    return result
  })

  ipcMain.handle('storage:purge-cloud-backed', async () => {
    const result = await purgeCloudBackedLocals(
      recordingsStore,
      authManager,
      linkedRiotFromAuth(),
    )
    const mainWindow = getMainWindow()
    mainWindow?.webContents.send('recordings:updated')
    mainWindow?.webContents.send('dashboard:refresh')
    return result
  })

  ipcMain.handle('storage:upload-pending', async () => {
    if (bulkPendingUploadRunning) {
      return { ok: false as const, error: 'Upload already in progress' }
    }
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { ok: false as const, error: 'App window unavailable' }
    }

    const pending = recordingsStore.getPending(linkedRiotFromAuth())
    if (pending.length === 0) {
      return { ok: true as const, uploaded: 0, failed: 0, stoppedEarly: false }
    }

    bulkPendingUploadRunning = true
    const user = authManager.getUser()
    let uploaded = 0
    let failed = 0
    let stoppedEarly = false
    let stopReason: string | undefined

    try {
      for (let i = 0; i < pending.length; i++) {
        const rec = pending[i]!
        mainWindow.webContents.send('storage:upload-progress', {
          current: i + 1,
          total: pending.length,
          map: rec.map,
          agent: rec.agent,
        })
        logActivity(`Uploading pending recording ${i + 1}/${pending.length}${rec.map ? ` (${rec.map})` : ''}…`)

        try {
          const archiveId = await doUploadArchiveOnly(
            rec.id,
            rec.path,
            rec.riotName || user?.riot_name || '',
            rec.riotTag || user?.riot_tag || '',
            rec.game,
            rec.map,
            rec.agent,
            rec.timeline,
            mainWindow,
            true,
          )
          if (archiveId) {
            uploaded++
          } else {
            failed++
          }
        } catch (err) {
          const isUpgrade = err instanceof UpgradeRequiredError
            || (err instanceof Error && /archive.limit.reached|archive_limit_reached|analysis.limit.reached/i.test(err.message))
          if (isUpgrade) {
            stoppedEarly = true
            stopReason = err instanceof Error ? err.message : 'Cloud storage limit reached'
            break
          }
          failed++
          log.warn('[StorageUpload] Pending archive failed:', err)
        }
      }
    } finally {
      bulkPendingUploadRunning = false
      const win = getMainWindow()
      win?.webContents.send('storage:upload-progress', null)
      win?.webContents.send('recordings:updated')
      win?.webContents.send('dashboard:refresh')
    }

    if (uploaded > 0) {
      logActivity(`Saved ${uploaded} recording(s) to cloud — local copies removed`)
    }

    return { ok: true as const, uploaded, failed, stoppedEarly, stopReason }
  })
}
