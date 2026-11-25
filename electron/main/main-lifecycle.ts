import { buildQuitActivity, createQuitGuard } from './quit-guard'
import { askQuitChoice } from './quit-dialog'
import { backgroundWork } from './background-work'
import { app, globalShortcut } from 'electron'
import { setInstallGate } from './updater'
import { cancelAllPollingTimers } from './ipc-handlers'
import { flushAllCataloguesSync } from './recordings-store-files'
import { destroyOverlay } from './overlay-window'
import log from 'electron-log'
import { getPostGameSessionSnapshot } from './post-game-session'
import type { MainRuntimeBindings } from './main-runtime-context'

export type MainLifecycleContext = Pick<MainRuntimeBindings,
  | 'createMainWindow'
  | 'cs2DemoRetrieval'
  | 'discordRPC'
  | 'gameDetector'
  | 'hotkeyManager'
  | 'ipcHandlersReady'
  | 'isQuitting'
  | 'localMediaWork'
  | 'mainWindow'
  | 'matchFinalizeInFlight'
  | 'obsRecorder'
  | 'overstepBridge'
  | 'postMatchJobStore'
  | 'recordingsStore'
  | 'replayScope'
  | 'stopInstanceCoordinator'
  | 'stopObsHealthMonitor'
  | 'supportActivity'
  | 'tray'
  | 'trayRefreshInterval'
>

/** Keeps callbacks bound to the live application state rather than a startup snapshot. */
export function createMainLifecycle(mainProcess: MainLifecycleContext) {
  function registerMainLifecycle(): void {
    // Re-show window when clicking dock icon on Mac
    app.on('activate', () => {
      if (!mainProcess.ipcHandlersReady) return
      if (!mainProcess.mainWindow || mainProcess.mainWindow.isDestroyed()) {
        mainProcess.mainWindow = mainProcess.createMainWindow()
      } else {
        mainProcess.mainWindow.show()
        mainProcess.mainWindow.focus()
      }
    })

    app.on('window-all-closed', () => {
      // Don't quit when all windows close — keep running in tray
    })

    app.on('child-process-gone', (_event, details) => {
      log.warn('[Main] Child process gone:', details.type, details.reason)
    })

    // Confirm before a quit (tray, menu, Cmd+Q) would cut off a recording, remux or upload.
    const quitGuard = createQuitGuard({
      getActivity: () => buildQuitActivity({
        recording: mainProcess.obsRecorder.isActivelyRecording(),
        finalizing: mainProcess.localMediaWork > 0 || mainProcess.matchFinalizeInFlight !== null,
        session: getPostGameSessionSnapshot(),
        recordings: mainProcess.recordingsStore?.listInFlightPipelines() ?? [],
        jobStages: mainProcess.postMatchJobStore?.list().map((j) => j.stage) ?? [],
      }),
      ask: (decision) => askQuitChoice(decision, mainProcess.mainWindow),
      quit: () => app.quit(),
      bypass: () => mainProcess.isQuitting,
      log: (message) => log.info(message),
    })
    // The in-app "Restart to update" destroys windows and starts the installer before
    // before-quit runs, so ask first; once approved the quit bypasses the guard.
    setInstallGate((proceed) => quitGuard.confirmThen(() => {
      mainProcess.isQuitting = true
      mainProcess.stopObsHealthMonitor?.()
      mainProcess.obsRecorder.forceStop()
      proceed()
    }))

    app.on('before-quit', (event) => {
      if (quitGuard.handleBeforeQuit(event)) return
      // Recordings catalogue writes are async + debounced; put the last change on disk before exit.
      flushAllCataloguesSync()
      mainProcess.supportActivity.flushSync()
      mainProcess.replayScope++
      mainProcess.cs2DemoRetrieval.clear()
      void mainProcess.overstepBridge?.disable()
      backgroundWork.cancel()
      mainProcess.isQuitting = true
      mainProcess.stopObsHealthMonitor?.()
      mainProcess.stopInstanceCoordinator?.()
      mainProcess.stopInstanceCoordinator = null
      mainProcess.obsRecorder.forceStop()
      if (mainProcess.trayRefreshInterval) clearInterval(mainProcess.trayRefreshInterval)
      try {
        mainProcess.tray?.destroy()
      } catch { /* ignore */ }
      mainProcess.tray = null
      cancelAllPollingTimers()
      mainProcess.gameDetector.stop()
      mainProcess.hotkeyManager.unregisterAll()
      globalShortcut.unregisterAll()
      destroyOverlay()
      mainProcess.discordRPC.destroy()
    })

  }

  return { registerMainLifecycle }
}
