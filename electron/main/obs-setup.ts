/**
 * UpForge OBS scene — game/window capture only (never full desktop).
 * Alt-tabbing shows black/last game frame in the VOD, not other apps.
 */

import { isBenignObsWebSocketError } from './obs-errors'
import type OBSWebSocket from 'obs-websocket-js'
import log from 'electron-log'
import { resolveObsCaptureWindow } from './game-window-finder'
import { obsCaptureConfig } from './game-config'
import { applyCrashSafeObsRecFormat } from './obs-rec-format'

export const UPFORGE_SCENE_NAME = 'UpForge'
export const UPFORGE_INPUT_NAME = 'UpForge Capture'
const UPFORGE_CAPTURE_PREFIX = 'UpForge Capture'

export function isUpForgeCaptureName(name: string): boolean {
  return name === UPFORGE_INPUT_NAME || name.startsWith(`${UPFORGE_CAPTURE_PREFIX} `)
}

async function listUpForgeCaptureInputNames(obs: OBSWebSocket): Promise<string[]> {
  const inputList = await obs.call('GetInputList') as { inputs?: { inputName: string }[] }
  return (inputList.inputs ?? [])
    .map((i) => i.inputName)
    .filter(isUpForgeCaptureName)
}

/** Remove duplicate UpForge capture sources (OBS appends " 2", " 3", … when recreate races). */
export async function pruneUpForgeCaptureSources(obs: OBSWebSocket): Promise<number> {
  let removed = 0
  try {
    const items = await obs.call('GetSceneItemList', { sceneName: UPFORGE_SCENE_NAME }) as {
      sceneItems?: { sourceName: string; sceneItemId: number }[]
    }
    for (const item of items.sceneItems ?? []) {
      if (!isUpForgeCaptureName(item.sourceName)) continue
      try {
        await obs.call('RemoveSceneItem', {
          sceneName: UPFORGE_SCENE_NAME,
          sceneItemId: item.sceneItemId,
        })
        removed++
      } catch { /* ignore */ }
    }
  } catch { /* scene may not exist */ }

  for (const inputName of await listUpForgeCaptureInputNames(obs)) {
    try {
      await obs.call('RemoveInput', { inputName })
      removed++
      log.info('[OBS Setup] Pruned capture input:', inputName)
    } catch { /* ignore */ }
  }
  return removed
}

export interface ObsSetupResult {
  ok: boolean
  sceneCreated: boolean
  inputCreated: boolean
  inputUpgraded?: boolean
  captureWindow?: string
  error?: string
}

const DESKTOP_CAPTURE_KINDS = new Set(['monitor_capture', 'display_capture', 'screen_capture'])

export function getUpForgeCaptureConfig(
  game: string,
  window: string,
): {
  inputKind: string
  inputSettings: Record<string, string | number | boolean>
} {
  const capture = obsCaptureConfig(game)

  if (process.platform === 'win32' && capture.useWindowCapture) {
    return {
      inputKind: 'window_capture',
      inputSettings: {
        window,
        method: capture.windowCaptureMethod,
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
  await pruneUpForgeCaptureSources(obs)
}

async function findUpForgeSceneItem(obs: OBSWebSocket): Promise<{
  sourceName: string
  sceneItemId: number
} | null> {
  const items = await obs.call('GetSceneItemList', { sceneName: UPFORGE_SCENE_NAME }) as {
    sceneItems?: { sourceName: string; sceneItemId: number }[]
  }
  const matches = (items.sceneItems ?? []).filter((i) => isUpForgeCaptureName(i.sourceName))
  if (!matches.length) return null
  const preferred = matches.find((i) => i.sourceName === UPFORGE_INPUT_NAME) ?? matches[matches.length - 1]
  return preferred ?? null
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
  let existingNames = await listUpForgeCaptureInputNames(obs)
  if (existingNames.length !== 1 || existingNames[0] !== UPFORGE_INPUT_NAME) {
    if (existingNames.length > 0) {
      log.info('[OBS Setup] Cleaning', existingNames.length, 'stale UpForge capture source(s)')
      await pruneUpForgeCaptureSources(obs)
    }
    existingNames = []
  }
  const hasCanonical = existingNames.includes(UPFORGE_INPUT_NAME)
  const hasInput = hasCanonical

  if (hasInput && !options.forceRecreate) {
    const targetName = hasCanonical ? UPFORGE_INPUT_NAME : existingNames[existingNames.length - 1]!
    const kind = await getInputKind(obs, targetName)
    const currentWindow = await getCurrentCaptureWindow(obs, targetName)
    const windowChanged = currentWindow !== captureWindow

    if (kind === inputKind && !windowChanged) {
      await obs.call('SetInputSettings', {
        inputName: targetName,
        inputSettings: inputSettings as never,
        overlay: true,
      })
      log.info('[OBS Setup] Updated capture target for', game, '→', captureWindow)
      return { inputCreated: false, inputUpgraded: false, captureWindow }
    }
  }

  if (options.forceRecreate || hasInput) {
    const kind = hasCanonical
      ? await getInputKind(obs, UPFORGE_INPUT_NAME)
      : existingNames.length
        ? await getInputKind(obs, existingNames[existingNames.length - 1]!)
        : null
    const inputUpgraded = !!kind
    if (kind && DESKTOP_CAPTURE_KINDS.has(kind)) {
      log.info('[OBS Setup] Upgrading desktop capture to', inputKind)
    } else if (options.forceRecreate || hasInput) {
      log.info('[OBS Setup] Recreating', inputKind, 'for', game)
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
    const item = await findUpForgeSceneItem(obs)
    if (!item) return

    const items = await obs.call('GetSceneItemList', { sceneName: UPFORGE_SCENE_NAME }) as {
      sceneItems?: { sourceName: string; sceneItemId: number }[]
    }
    for (const sceneItem of items.sceneItems ?? []) {
      if (!isUpForgeCaptureName(sceneItem.sourceName)) continue
      if (sceneItem.sceneItemId !== item.sceneItemId) {
        await obs.call('RemoveSceneItem', {
          sceneName: UPFORGE_SCENE_NAME,
          sceneItemId: sceneItem.sceneItemId,
        }).catch(() => { /* ignore */ })
      }
    }

    const freshItem = await findUpForgeSceneItem(obs)
    if (!freshItem) return

    const video = await obs.call('GetVideoSettings') as {
      baseWidth?: number
      baseHeight?: number
    }
    const boundsWidth = video.baseWidth ?? 1920
    const boundsHeight = video.baseHeight ?? 1080
    if (boundsWidth < 1 || boundsHeight < 1) return

    await obs.call('SetSceneItemTransform', {
      sceneName: UPFORGE_SCENE_NAME,
      sceneItemId: freshItem.sceneItemId,
      sceneItemTransform: {
        positionX: 0,
        positionY: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        alignment: 5,
        // SCALE_INNER = full game view (letterbox if needed). SCALE_OUTER crops edges and
        // can zoom HUD when capture dimensions settle late after the loading screen.
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
    if (isBenignObsWebSocketError(err)) {
      log.debug('[OBS Setup] fitUpForgeCaptureToCanvas skipped stale scene item')
      return
    }
    log.warn('[OBS Setup] fitUpForgeCaptureToCanvas failed:', err instanceof Error ? err.message : err)
  }
}

/** OBS needs a moment after retargeting before source dimensions are stable — refit again. */
export async function refitCaptureWithSettle(
  obs: OBSWebSocket,
  delaysMs: number[] = [600, 1800, 4000],
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

    if (options.switchScene !== false) {
      await obs.call('SetCurrentProgramScene', { sceneName: UPFORGE_SCENE_NAME })
    }

    await fitUpForgeCaptureToCanvas(obs)

    try {
      const versionInfo = await obs.call('GetVersion') as { obsVersion?: string }
      await applyCrashSafeObsRecFormat(obs, versionInfo.obsVersion)
    } catch {
      await applyCrashSafeObsRecFormat(obs, null)
    }

    const profileParams: Array<[string, string, string]> = [
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
