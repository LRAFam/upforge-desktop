/**
 * Settings › Advanced — "Save raw game data for the next match (diagnostics)".
 * Local-only diagnostics: nothing here uploads anything. See docs/debug/game-data-capture.md.
 */

import type { IpcMain } from 'electron'
import { getGameDataCapture, type CaptureStatus } from '../game-data-capture'
import { installSteamGsiConfig } from '../steam-gsi-server'
import { openPathSafe } from '../shell-open'

export interface GameDataCaptureStatusResponse extends CaptureStatus {
  /** CS2 cfg was rewritten — CS2 must be restarted for it to load. */
  cs2NeedsRestart?: boolean
}

export function setupGameDataCaptureHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('diagnostics:game-capture-status', (): GameDataCaptureStatusResponse | null => {
    return getGameDataCapture()?.getStatus() ?? null
  })

  ipcMain.handle('diagnostics:game-capture-set', async (_e, on: unknown): Promise<GameDataCaptureStatusResponse | null> => {
    const capture = getGameDataCapture()
    if (!capture) return null
    const status = capture.setArmed(on === true)
    // Arming writes the all-components CS2 cfg now, so the owner can restart CS2 before playing.
    // Switching off restores the normal cfg through the onDisarmed listener (steam-gsi-server).
    if (on === true) {
      const cfg = await installSteamGsiConfig('cs2').catch(() => ({ ok: false, needsRestart: false }))
      return { ...status, cs2NeedsRestart: Boolean(cfg.needsRestart) }
    }
    return status
  })

  ipcMain.handle('diagnostics:game-capture-open-folder', async () => {
    const capture = getGameDataCapture()
    if (!capture) return { ok: false, error: 'Unavailable' }
    return openPathSafe(capture.dir, { createIfMissing: true })
  })
}
