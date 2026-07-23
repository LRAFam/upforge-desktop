/**
 * Ensure OBS is running and WebSocket-connected.
 * When a hung obs64.exe is left after a crash, kill it then relaunch.
 *
 * Avoid kill-loops: if OBS was just launched (or is still booting), prefer
 * patient WebSocket retries over treating a slow start as a crash.
 */

import type { BrowserWindow } from 'electron'
import log from 'electron-log'
import { explainObsConnectionFailure } from './obs-connect'
import { broadcastObsConnection } from './obs-health'
import { launchObsStudio, obsLaunchDelayMs } from './obs-launcher'
import { isObsProcessRunning, obsProcessSleep, terminateObsProcess } from './obs-process'
import type { OBSRecorder } from './obs-recorder'

export interface EnsureObsConnectedOptions {
  password: string
  port: number
  getWindow?: () => BrowserWindow | null | undefined
  /**
   * When true (default), kill a running OBS process that fails WebSocket connect,
   * then relaunch. Disable mid-match so we do not kill an active recording.
   */
  allowProcessRestart?: boolean
  onActivity?: (msg: string) => void
}

export type EnsureObsConnectedResult =
  | {
      ok: true
      alreadyConnected?: boolean
      alreadyRunning?: boolean
      launched?: boolean
      processRunning: boolean
    }
  | {
      ok: false
      error: string
      processRunning: boolean
      needsManualRestart?: boolean
      launched?: boolean
    }

/** Skip kill-restart while OBS may still be booting after our last launch. */
const OBS_LAUNCH_COOLDOWN_MS = 45_000

let lastObsLaunchAt = 0

/** Test helper — reset launch cooldown between specs. */
export function resetObsLaunchCooldownForTests(): void {
  lastObsLaunchAt = 0
}

async function connectWithRetries(
  obsRecorder: OBSRecorder,
  delaysMs: number[],
): Promise<{ ok: true } | { ok: false; error?: string }> {
  let lastError: string | undefined
  for (const delayMs of delaysMs) {
    await obsProcessSleep(delayMs)
    const result = await obsRecorder.connect()
    if (result.ok) return { ok: true }
    lastError = result.error
  }
  return { ok: false, error: lastError }
}

function recentlyLaunchedObs(): boolean {
  return lastObsLaunchAt > 0 && Date.now() - lastObsLaunchAt < OBS_LAUNCH_COOLDOWN_MS
}

/**
 * Connect to OBS, launching (and if needed restarting a hung process) as required.
 */
export async function ensureObsConnected(
  obsRecorder: OBSRecorder,
  opts: EnsureObsConnectedOptions,
): Promise<EnsureObsConnectedResult> {
  const allowProcessRestart = opts.allowProcessRestart !== false
  const win = () => opts.getWindow?.() ?? null

  if (obsRecorder.isConnected()) {
    return { ok: true, alreadyConnected: true, processRunning: true }
  }

  let processRunning = await isObsProcessRunning()
  if (processRunning) {
    const existing = await obsRecorder.connect()
    if (existing.ok) {
      broadcastObsConnection(win(), obsRecorder)
      return { ok: true, alreadyRunning: true, processRunning: true }
    }

    // OBS process is up but WS failed — often still booting after a fresh launch.
    const patient = await connectWithRetries(obsRecorder, [1500, 2000, 3000, 4000])
    if (patient.ok) {
      broadcastObsConnection(win(), obsRecorder)
      return { ok: true, alreadyRunning: true, processRunning: true }
    }

    if (!allowProcessRestart || recentlyLaunchedObs()) {
      if (recentlyLaunchedObs()) {
        log.warn('[OBS Ensure] Process up but WebSocket still down during launch cooldown — not killing')
        opts.onActivity?.('OBS still starting — waiting for connection…')
      }
      return {
        ok: false,
        processRunning: true,
        error: explainObsConnectionFailure({
          processRunning: true,
          connectError: patient.error ?? existing.error,
        }),
      }
    }

    log.warn('[OBS Ensure] Process running but WebSocket failed — restarting OBS')
    opts.onActivity?.('OBS stuck after crash — restarting recording engine…')
    const killed = await terminateObsProcess()
    if (!killed.ok) {
      return {
        ok: false,
        processRunning: true,
        needsManualRestart: true,
        error: killed.error ?? explainObsConnectionFailure({
          processRunning: true,
          connectError: patient.error ?? existing.error,
        }),
      }
    }
    processRunning = false
  }

  const launched = await launchObsStudio({
    password: opts.password,
    port: opts.port,
  })
  if (!launched.ok) {
    return {
      ok: false,
      error: launched.error ?? 'Could not launch OBS',
      processRunning: false,
    }
  }

  lastObsLaunchAt = Date.now()
  opts.onActivity?.('Starting OBS — connecting…')
  const connected = await connectWithRetries(obsRecorder, [
    obsLaunchDelayMs(),
    2000,
    2500,
    3000,
    4000,
  ])
  if (connected.ok) {
    broadcastObsConnection(win(), obsRecorder)
    opts.onActivity?.('OBS connected — recording ready')
    return { ok: true, launched: true, processRunning: true }
  }

  processRunning = await isObsProcessRunning()
  broadcastObsConnection(win(), obsRecorder, connected.error)
  return {
    ok: false,
    launched: true,
    processRunning,
    error: explainObsConnectionFailure({
      processRunning,
      connectError: connected.error,
      launched: true,
    }),
  }
}
