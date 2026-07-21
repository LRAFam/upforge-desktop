/**
 * Proactive OBS connection checks — surface setup issues at app open, not at match start.
 * When idle, recovers hung/missing OBS via kill-then-relaunch (see ensureObsConnected).
 */

import type { BrowserWindow } from 'electron'
import { Notification } from 'electron'
import log from 'electron-log'
import { showAppNotification } from './app-notifications'
import type { OBSRecorder } from './obs-recorder'

let lastObsSetupNotifyAt = 0
const OBS_SETUP_NOTIFY_COOLDOWN_MS = 30 * 60 * 1000

export interface ObsConnectionPayload {
  connected: boolean
  error: string | null
  obsVersion: string | null
}

export function broadcastObsConnection(
  mainWindow: BrowserWindow | null | undefined,
  obsRecorder: OBSRecorder,
  error?: string | null,
): ObsConnectionPayload {
  const status = obsRecorder.getOBSStatus()
  const payload: ObsConnectionPayload = {
    connected: status.connected,
    error: error ?? (status.connected ? null : status.lastError),
    obsVersion: status.obsVersion,
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('obs:connection-changed', payload)
  }
  return payload
}

export async function probeObsConnection(
  obsRecorder: OBSRecorder,
  mainWindow: BrowserWindow | null | undefined,
  opts?: {
    notify?: boolean
    notifySilent?: () => boolean
    logActivity?: (msg: string) => void
    quiet?: boolean
  },
): Promise<ObsConnectionPayload> {
  if (obsRecorder.isConnected()) {
    return broadcastObsConnection(mainWindow, obsRecorder)
  }

  const result = await obsRecorder.connect().catch((err) => ({
    ok: false as const,
    error: err instanceof Error ? err.message : String(err),
  }))

  if (result.ok) {
    if (!opts?.quiet) opts?.logActivity?.('OBS connected — recording ready')
    return broadcastObsConnection(mainWindow, obsRecorder)
  }

  const error = result.error ?? 'OBS not running'
  if (!opts?.quiet) {
    log.info('[OBS Health] Connection probe failed:', error)
  }
  const payload = broadcastObsConnection(mainWindow, obsRecorder, error)
  if (!opts?.quiet) {
    opts?.logActivity?.('OBS not connected — open Settings → Recording to fix')
  }

  if (opts?.notify && Notification.isSupported()) {
    const now = Date.now()
    if (now - lastObsSetupNotifyAt >= OBS_SETUP_NOTIFY_COOLDOWN_MS) {
      lastObsSetupNotifyAt = now
      showAppNotification({
        title: 'UpForge — OBS Required',
        body: 'OBS is not connected. Set it up in Settings → Recording before your next match.',
        silent: opts.notifySilent?.() ?? true,
      })
    }
  }

  return payload
}

/** Retry OBS connect while disconnected — recovers hung/missing OBS when allowed. */
export function startObsHealthMonitor(
  obsRecorder: OBSRecorder,
  getMainWindow: () => BrowserWindow | null | undefined,
  opts?: {
    logActivity?: (msg: string) => void
    /** Full launch/restart recovery (kill hung process). */
    recover?: () => Promise<boolean>
    /** False while a match is recording — only soft-reconnect then. */
    canHardRecover?: () => boolean
  },
): () => void {
  let intervalMs = 30_000
  let timer: ReturnType<typeof setTimeout> | null = null
  let consecutiveFailures = 0

  const schedule = () => {
    timer = setTimeout(async () => {
      if (obsRecorder.isConnected()) {
        intervalMs = 30_000
        consecutiveFailures = 0
        schedule()
        return
      }
      const mainWindow = getMainWindow()
      if (!mainWindow || mainWindow.isDestroyed()) {
        schedule()
        return
      }

      const hardOk = opts?.canHardRecover?.() !== false
      if (hardOk && opts?.recover && consecutiveFailures >= 1) {
        // Soft probe failed once already — launch / kill-restart OBS.
        const recovered = await opts.recover().catch((err) => {
          log.warn('[OBS Health] Recovery failed:', err)
          return false
        })
        if (recovered) {
          consecutiveFailures = 0
          intervalMs = 30_000
          schedule()
          return
        }
        consecutiveFailures++
      } else {
        await probeObsConnection(obsRecorder, mainWindow, {
          notify: false,
          quiet: true,
          logActivity: opts?.logActivity,
        })
        if (obsRecorder.isConnected()) {
          consecutiveFailures = 0
          intervalMs = 30_000
          schedule()
          return
        }
        consecutiveFailures++
      }

      intervalMs = Math.min(intervalMs * 1.5, 120_000)
      schedule()
    }, intervalMs)
  }

  schedule()

  return () => {
    if (timer) clearTimeout(timer)
  }
}
