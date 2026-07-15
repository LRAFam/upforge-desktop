/**
 * ipc-handlers.ts
 * Coordinates all IPC handler registration.
 * Domain-specific logic lives in the ipc/ subdirectory.
 *
 * Re-exports shared utilities consumed by index.ts and other modules.
 */

import { IpcMain, BrowserWindow } from 'electron'
import { is } from '@electron-toolkit/utils'
import log from 'electron-log'
import { requestOverlayToggle, setOverlayInteractive } from './overlay-window'

import { AuthManager } from './auth-manager'
import type { MatchRecorder } from './match-recorder'
import { OBSRecorder } from './obs-recorder'
import { GameDetector } from './game-detector'
import { SettingsManager } from './settings-manager'
import { UploadManager } from './upload-manager'
import { ClipStore } from './clip-store'
import { ClipExtractor } from './clip-extractor'
import { HotkeyManager } from './hotkey-manager'
import { PerformanceManager } from './performance-manager'
import { TrainerBridge } from './trainer-bridge'

// Domain handler setup functions
import { setupAuthHandlers } from './ipc/auth-ipc'
import { setupAppHandlers } from './ipc/app-ipc'
import { setupMediaHandlers } from './ipc/media-ipc'
import { setupGamingHandlers } from './ipc/gaming-ipc'

// Re-export shared state consumed by index.ts
export {
  cancelAllPollingTimers,
  consumePendingCaptureRequest,
  consumePendingCaptureSourceId,
  setPendingCaptureSource,
  setPendingCaptureSourceId,
} from './ipc/api-helpers'

export { setupClipHandlers } from './ipc/clips-ipc'

// ── Debug: hotkey conflict scanner ───────────────────────────────────────────

function setupDebugHandlers(ipcMain: IpcMain, gameDetector: GameDetector): void {
  ipcMain.handle('debug:find-hotkey-conflict', async () => {
    if (process.platform !== 'win32') {
      return { supported: false, found: [] }
    }
    const KNOWN_CULPRITS: Array<{ exe: string; name: string; fix: string }> = [
      { exe: 'Discord.exe',            name: 'Discord',               fix: 'Settings → Keybinds — remove any F9 binding' },
      { exe: 'DiscordPTB.exe',         name: 'Discord PTB',           fix: 'Settings → Keybinds — remove any F9 binding' },
      { exe: 'DiscordCanary.exe',      name: 'Discord Canary',        fix: 'Settings → Keybinds — remove any F9 binding' },
      { exe: 'obs64.exe',              name: 'OBS Studio',            fix: 'Settings → Hotkeys — clear any F9 hotkey' },
      { exe: 'obs32.exe',              name: 'OBS Studio (32-bit)',   fix: 'Settings → Hotkeys — clear any F9 hotkey' },
      { exe: 'NVIDIA Share.exe',       name: 'NVIDIA GeForce Experience (Share/ShadowPlay)', fix: 'GeForce Experience → Settings → Overlay — disable or rebind hotkeys' },
      { exe: 'nvcontainer.exe',        name: 'NVIDIA Container',      fix: 'GeForce Experience → Settings — disable in-game overlay' },
      { exe: 'LGHUB.exe',              name: 'Logitech G HUB',        fix: 'G HUB → Assignments — remove any F9 macro binding' },
      { exe: 'LCore.exe',              name: 'Logitech Gaming Software', fix: 'LGS → Assignments — remove any F9 macro binding' },
      { exe: 'RzSynapse.exe',          name: 'Razer Synapse',         fix: 'Synapse → Keyboard macros — remove any F9 binding' },
      { exe: 'Razer Synapse 3.exe',    name: 'Razer Synapse 3',       fix: 'Synapse → Keyboard macros — remove any F9 binding' },
      { exe: 'SteelSeriesGG.exe',      name: 'SteelSeries GG',        fix: 'SteelSeries GG → Engine — remove any F9 macro' },
      { exe: 'iCUE.exe',               name: 'Corsair iCUE',          fix: 'iCUE → Profiles — remove any F9 action' },
      { exe: 'NGENUITY.exe',           name: 'HyperX NGenuity',       fix: 'NGenuity → Macros — remove any F9 binding' },
      { exe: 'StreamDeck.exe',         name: 'Elgato Stream Deck',    fix: 'Stream Deck software — remove any F9 action' },
      { exe: 'AutoHotkey.exe',         name: 'AutoHotkey',            fix: 'Close or edit your AutoHotkey script — check for F9 hotkey' },
      { exe: 'AutoHotkey64.exe',       name: 'AutoHotkey (64-bit)',   fix: 'Close or edit your AutoHotkey script — check for F9 hotkey' },
      { exe: 'XboxGameBarWidgets.exe', name: 'Xbox Game Bar',         fix: 'Windows Settings → Gaming → Xbox Game Bar — disable or rebind' },
      { exe: 'GameBar.exe',            name: 'Xbox Game Bar',         fix: 'Windows Settings → Gaming → Xbox Game Bar — disable or rebind' },
      { exe: 'MSIAfterburner.exe',     name: 'MSI Afterburner',       fix: 'Afterburner → Settings → On-Screen Display — rebind hotkeys' },
      { exe: 'RTSS.exe',               name: 'RivaTuner Statistics Server', fix: 'RTSS → Setup — rebind hotkeys' },
      { exe: 'voicemeeter.exe',        name: 'VoiceMeeter',           fix: 'VoiceMeeter → Menu → System Settings — remove any F9 binding' },
      { exe: 'voicemeeterpro.exe',     name: 'VoiceMeeter Potato',    fix: 'VoiceMeeter → System Settings — remove any F9 binding' },
      { exe: 'EpicGamesLauncher.exe',  name: 'Epic Games Launcher',   fix: 'Epic Settings → In-Game Overlay — disable or rebind' },
      { exe: 'PlayNitroSense.exe',     name: 'NitroSense',            fix: 'NitroSense Settings — rebind or disable hotkeys' },
    ]

    try {
      const { execSync } = await import('child_process')
      const output = execSync('tasklist /FO CSV /NH', { timeout: 5000, encoding: 'utf8' })
      const runningExes = new Set(
        output.split('\n')
          .map(line => line.trim().replace(/^"/, '').split('"')[0].toLowerCase())
          .filter(Boolean)
      )
      const found = KNOWN_CULPRITS.filter(c => runningExes.has(c.exe.toLowerCase()))
      log.info('[HotkeyDiag] Running processes checked, conflicts found:', found.map(f => f.name))
      return { supported: true, found }
    } catch (err) {
      log.warn('[HotkeyDiag] tasklist failed:', err)
      return { supported: true, found: [], error: 'Could not scan processes' }
    }
  })

  ipcMain.handle('overlay:toggle', () => requestOverlayToggle())

  ipcMain.on('overlay:set-interactive', (_e, interactive: boolean) => {
    setOverlayInteractive(interactive)
  })
}

// ── Main coordinator ──────────────────────────────────────────────────────────

export function setupIpcHandlers(
  ipcMain: IpcMain,
  auth: AuthManager,
  getActiveRecorder: () => MatchRecorder,
  gameDetector: GameDetector,
  settingsManager: SettingsManager,
  openPostGameFn?: () => void,
  getFFmpegOk?: () => boolean,
  getWaitingForMatch?: () => boolean,
  getActivityLog?: () => { time: number; message: string; game?: string }[],
  uploadManager?: UploadManager,
  showClipsFn?: () => void,
  performanceManager?: PerformanceManager,
  obsRecorder?: OBSRecorder,
  trainerBridge?: TrainerBridge,
  endMatchRecording?: (game: string) => Promise<{ ok: boolean; reason?: string }>,
  getRecordingBackend?: () => 'obs',
  getCurrentQueueMode?: () => string | null,
  getAudioDetectRecorder?: () => MatchRecorder,
  getObsConnected?: () => boolean,
  onSettingsSaved?: (settings: ReturnType<SettingsManager['get']>) => void,
  onLoginSuccess?: () => void,
  onLogout?: () => void,
  getLocalRecordingPathByJobId?: (jobId: string) => string | null,
): void {
  setupAuthHandlers(
    ipcMain,
    auth,
    getActiveRecorder,
    gameDetector,
    uploadManager,
    endMatchRecording,
    onLoginSuccess,
    onLogout,
    getLocalRecordingPathByJobId,
  )

  setupAppHandlers(
    ipcMain, auth, getActiveRecorder, gameDetector, settingsManager,
    openPostGameFn, getFFmpegOk, getWaitingForMatch, getActivityLog, showClipsFn,
    getRecordingBackend, getCurrentQueueMode, getObsConnected,
    obsRecorder, onSettingsSaved,
  )

  setupMediaHandlers(
    ipcMain, getActiveRecorder, settingsManager, obsRecorder,
    endMatchRecording, () => gameDetector.currentGame(),
    getAudioDetectRecorder,
  )

  setupGamingHandlers(ipcMain, auth, settingsManager, gameDetector, performanceManager, trainerBridge)

  setupDebugHandlers(ipcMain, gameDetector)
}
