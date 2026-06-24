/**
 * UpForge OBS scene — game/window capture only (never full desktop).
 * Alt-tabbing shows black/last game frame in the VOD, not other apps.
 */

import type OBSWebSocket from 'obs-websocket-js'
import log from 'electron-log'
import { resolveObsCaptureWindow } from './game-window-finder'

export const UPFORGE_SCENE_NAME = 'UpForge'
export const UPFORGE_INPUT_NAME = 'UpForge Capture'

export interface ObsSetupResult {
  ok: boolean
  sceneCreated: boolean
  inputCreated: boolean
  inputUpgraded?: boolean
  captureWindow?: string
  error?: string
}

const DESKTOP_CAPTURE_KINDS = new Set(['monitor_capture', 'display_capture', 'screen_capture'])

/** Source 2 titles block OBS game-capture hooks — use window capture instead. */
function usesWindowCapture(game: string): boolean {
  const g = game.toLowerCase()
  return g === 'cs2' || g === 'deadlock'
}

export function getUpForgeCaptureConfig(
  game: string,
  window: string,
): {
  inputKind: string
  inputSettings: Record<string, string | number | boolean>
} {
  const normalized = game.toLowerCase()

  if (process.platform === 'win32' && usesWindowCapture(normalized)) {
    return {
      inputKind: 'window_capture',
      inputSettings: {
        window,
        method: 0,
        priority: 0,
        cursor: false,
        compatibility: false,
      },
    }
  }

  if (process.platform === 'win32') {
    return {
      inputKind: 'game_capture',
      inputSettings: {
        window,
        capture_mode: 'window',
        capture_cursor: false,
        allow_transparency: false,
        capture_wildcards: false,
        priority: 2,
      },
    }
  }

  // macOS — window capture (no game hook); still limits to the game window vs full display.
  return {
    inputKind: 'window_capture',
    inputSettings: {
      window: window.split(':')[0] ?? window,
      show_shadow: false,
      show_empty_names: false,
    },
  }
}

async function getInputKind(obs: OBSWebSocket, inputName: string): Promise<string | null> {
  try {
    const res = await obs.call('GetInputSettings', { inputName }) as { inputKind?: string }
    return res.inputKind ?? null
  } catch {
    return null
  }
}

async function getCurrentCaptureWindow(obs: OBSWebSocket, inputName: string): Promise<string | null> {
  try {
    const res = await obs.call('GetInputSettings', { inputName }) as {
      inputSettings?: { window?: string }
    }
    const window = res.inputSettings?.window
    return typeof window === 'string' && window.length > 0 ? window : null
  } catch {
    return null
  }
}

export type EnsureUpForgeCaptureOptions = {
  /** Tear down and recreate the capture source (resets resolution after game switches). */
  forceRecreate?: boolean
  windowOverride?: string
}

async function removeUpForgeInput(obs: OBSWebSocket): Promise<void> {
  try {
    await obs.call('RemoveInput', { inputName: UPFORGE_INPUT_NAME })
    log.info('[OBS Setup] Removed old capture input:', UPFORGE_INPUT_NAME)
  } catch {
    /* input may not exist */
  }
}

/**
 * Ensure capture source is game/window scoped — upgrades legacy monitor_capture scenes.
 */
export async function ensureUpForgeCapture(
  obs: OBSWebSocket,
  game: string,
  options: EnsureUpForgeCaptureOptions = {},
): Promise<{ inputCreated: boolean; inputUpgraded: boolean; captureWindow: string }> {
  const captureWindow = options.windowOverride ?? await resolveObsCaptureWindow(game)
  const { inputKind, inputSettings } = getUpForgeCaptureConfig(game, captureWindow)
  const inputList = await obs.call('GetInputList') as { inputs?: { inputName: string }[] }
  const hasInput = inputList.inputs?.some((i) => i.inputName === UPFORGE_INPUT_NAME) ?? false

  if (hasInput) {
    const kind = await getInputKind(obs, UPFORGE_INPUT_NAME)
    const currentWindow = await getCurrentCaptureWindow(obs, UPFORGE_INPUT_NAME)
    const windowChanged = currentWindow !== captureWindow
    const needsRecreate = options.forceRecreate || kind !== inputKind || windowChanged

    if (!needsRecreate && kind === inputKind) {
      await obs.call('SetInputSettings', {
        inputName: UPFORGE_INPUT_NAME,
        inputSettings: inputSettings as never,
        overlay: true,
      })
      log.info('[OBS Setup] Updated capture target for', game, '→', captureWindow)
      return { inputCreated: false, inputUpgraded: false, captureWindow }
    }
    const inputUpgraded = !!kind
    if (kind && DESKTOP_CAPTURE_KINDS.has(kind)) {
      log.info('[OBS Setup] Upgrading desktop capture to', inputKind)
    } else if (needsRecreate) {
      log.info('[OBS Setup] Recreating', inputKind, 'for', game, '(game/window changed)')
    }
    await removeUpForgeInput(obs)
    await obs.call('CreateInput', {
      sceneName: UPFORGE_SCENE_NAME,
      inputName: UPFORGE_INPUT_NAME,
      inputKind,
      inputSettings: inputSettings as never,
      sceneItemEnabled: true,
    })
    log.info('[OBS Setup] Created', inputKind, 'for', game, '→', captureWindow)
    return { inputCreated: true, inputUpgraded, captureWindow }
  }

  await obs.call('CreateInput', {
    sceneName: UPFORGE_SCENE_NAME,
    inputName: UPFORGE_INPUT_NAME,
    inputKind,
    inputSettings: inputSettings as never,
    sceneItemEnabled: true,
  })
  log.info('[OBS Setup] Created', inputKind, 'for', game, '→', captureWindow)
  return { inputCreated: true, inputUpgraded: false, captureWindow }
}

/** Scale the capture source to fill the OBS canvas (same as Transform → Fit to screen). */
export async function fitUpForgeCaptureToCanvas(obs: OBSWebSocket): Promise<void> {
  try {
    const items = await obs.call('GetSceneItemList', { sceneName: UPFORGE_SCENE_NAME }) as {
      sceneItems?: { sourceName: string; sceneItemId: number }[]
    }
    const item = items.sceneItems?.find((i) => i.sourceName === UPFORGE_INPUT_NAME)
    if (!item) return

    const video = await obs.call('GetVideoSettings') as {
      baseWidth?: number
      baseHeight?: number
    }
    const boundsWidth = video.baseWidth ?? 1920
    const boundsHeight = video.baseHeight ?? 1080
    if (boundsWidth < 1 || boundsHeight < 1) return

    await obs.call('SetSceneItemTransform', {
      sceneName: UPFORGE_SCENE_NAME,
      sceneItemId: item.sceneItemId,
      sceneItemTransform: {
        positionX: 0,
        positionY: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        alignment: 5,
        boundsType: 'OBS_BOUNDS_SCALE_INNER',
        boundsAlignment: 0,
        boundsWidth,
        boundsHeight,
        cropTop: 0,
        cropRight: 0,
        cropBottom: 0,
        cropLeft: 0,
      },
    })
    log.info('[OBS Setup] Fit capture to canvas', boundsWidth, '×', boundsHeight)
  } catch (err) {
    log.warn('[OBS Setup] fitUpForgeCaptureToCanvas failed:', err instanceof Error ? err.message : err)
  }
}

/** OBS needs a moment after retargeting before source dimensions are stable — refit again. */
export async function refitCaptureWithSettle(
  obs: OBSWebSocket,
  delaysMs: number[] = [1200, 2800],
): Promise<void> {
  await fitUpForgeCaptureToCanvas(obs)
  for (const delayMs of delaysMs) {
    await new Promise((resolve) => setTimeout(resolve, delayMs))
    await fitUpForgeCaptureToCanvas(obs)
  }
}

export type ObsSceneSwitchOptions = {
  /** When false, update capture on the UpForge scene but leave the streamer's active scene alone. */
  switchScene?: boolean
  forceRecreate?: boolean
  /** Refit after short delays so capture resolution matches the new game window. */
  refitAfterSettle?: boolean
}

/** Re-target capture to the active game window right before recording starts. */
export async function retargetUpForgeCapture(
  obs: OBSWebSocket,
  game: string,
  options: ObsSceneSwitchOptions = {},
): Promise<{ captureWindow: string }> {
  const capture = await ensureUpForgeCapture(obs, game, {
    forceRecreate: options.forceRecreate,
  })
  if (options.switchScene !== false) {
    await obs.call('SetCurrentProgramScene', { sceneName: UPFORGE_SCENE_NAME }).catch(() => { /* non-fatal */ })
  }
  if (options.refitAfterSettle) {
    await refitCaptureWithSettle(obs)
  } else {
    await fitUpForgeCaptureToCanvas(obs)
  }
  return { captureWindow: capture.captureWindow }
}

export async function setupUpForgeScene(
  obs: OBSWebSocket,
  game = 'valorant',
  options: ObsSceneSwitchOptions = {},
): Promise<ObsSetupResult> {
  let sceneCreated = false
  let inputCreated = false
  let inputUpgraded = false
  let captureWindow: string | undefined

  try {
    const sceneList = await obs.call('GetSceneList') as unknown as { scenes?: { sceneName: string }[] }
    const hasScene = sceneList.scenes?.some((s) => s.sceneName === UPFORGE_SCENE_NAME) ?? false

    if (!hasScene) {
      await obs.call('CreateScene', { sceneName: UPFORGE_SCENE_NAME })
      sceneCreated = true
      log.info('[OBS Setup] Created scene:', UPFORGE_SCENE_NAME)
    }

    const capture = await ensureUpForgeCapture(obs, game)
    inputCreated = capture.inputCreated
    inputUpgraded = capture.inputUpgraded
    captureWindow = capture.captureWindow

    const items = await obs.call('GetSceneItemList', { sceneName: UPFORGE_SCENE_NAME }) as {
      sceneItems?: { sourceName: string }[]
    }
    if (!items.sceneItems?.some((i) => i.sourceName === UPFORGE_INPUT_NAME)) {
      await obs.call('CreateSceneItem', {
        sceneName: UPFORGE_SCENE_NAME,
        sourceName: UPFORGE_INPUT_NAME,
        sceneItemEnabled: true,
      })
    }

    if (options.switchScene !== false) {
      await obs.call('SetCurrentProgramScene', { sceneName: UPFORGE_SCENE_NAME })
    }

    await fitUpForgeCaptureToCanvas(obs)

    const profileParams: Array<[string, string, string]> = [
      ['SimpleOutput', 'RecFormat', 'mp4'],
      ['SimpleOutput', 'ReplayBufferEnable', 'true'],
    ]
    for (const [parameterCategory, parameterName, parameterValue] of profileParams) {
      await obs.call('SetProfileParameter', {
        parameterCategory,
        parameterName,
        parameterValue,
      }).catch(() => { /* profile layout varies — non-fatal */ })
    }

    return { ok: true, sceneCreated, inputCreated, inputUpgraded, captureWindow }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.warn('[OBS Setup] setupUpForgeScene failed:', msg)
    return { ok: false, sceneCreated, inputCreated, inputUpgraded, captureWindow, error: msg }
  }
}
