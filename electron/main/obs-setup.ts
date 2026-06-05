/**
 * UpForge OBS scene — game/window capture only (never full desktop).
 * Alt-tabbing shows black/last game frame in the VOD, not other apps.
 */

import type OBSWebSocket from 'obs-websocket-js'
import log from 'electron-log'

export const UPFORGE_SCENE_NAME = 'UpForge'
export const UPFORGE_INPUT_NAME = 'UpForge Capture'

export interface ObsSetupResult {
  ok: boolean
  sceneCreated: boolean
  inputCreated: boolean
  inputUpgraded?: boolean
  error?: string
}

/** OBS game-capture window strings (title:class:executable). */
const GAME_CAPTURE_WINDOWS: Record<string, string> = {
  valorant: 'VALORANT  :UnrealWindow:VALORANT-Win64-Shipping.exe',
  cs2: 'Counter-Strike 2:SDL_app:cs2.exe',
  deadlock: 'Deadlock:SDL_app:deadlock.exe',
}

const DESKTOP_CAPTURE_KINDS = new Set(['monitor_capture', 'display_capture', 'screen_capture'])

export function getUpForgeCaptureConfig(game: string): {
  inputKind: string
  inputSettings: Record<string, string | number | boolean>
} {
  const normalized = game.toLowerCase()
  const window = GAME_CAPTURE_WINDOWS[normalized] ?? GAME_CAPTURE_WINDOWS.valorant

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
): Promise<{ inputCreated: boolean; inputUpgraded: boolean }> {
  const { inputKind, inputSettings } = getUpForgeCaptureConfig(game)
  const inputList = await obs.call('GetInputList') as { inputs?: { inputName: string }[] }
  const hasInput = inputList.inputs?.some((i) => i.inputName === UPFORGE_INPUT_NAME) ?? false

  if (hasInput) {
    const kind = await getInputKind(obs, UPFORGE_INPUT_NAME)
    if (kind === inputKind) {
      await obs.call('SetInputSettings', {
        inputName: UPFORGE_INPUT_NAME,
        inputSettings: inputSettings as never,
      })
      log.info('[OBS Setup] Updated capture target for', game)
      return { inputCreated: false, inputUpgraded: false }
    }
    const inputUpgraded = !!kind
    if (kind && DESKTOP_CAPTURE_KINDS.has(kind)) {
      log.info('[OBS Setup] Upgrading desktop capture to', inputKind)
    }
    await removeUpForgeInput(obs)
    await obs.call('CreateInput', {
      sceneName: UPFORGE_SCENE_NAME,
      inputName: UPFORGE_INPUT_NAME,
      inputKind,
      inputSettings: inputSettings as never,
      sceneItemEnabled: true,
    })
    log.info('[OBS Setup] Created', inputKind, 'for', game)
    return { inputCreated: true, inputUpgraded }
  }

  await obs.call('CreateInput', {
    sceneName: UPFORGE_SCENE_NAME,
    inputName: UPFORGE_INPUT_NAME,
    inputKind,
    inputSettings: inputSettings as never,
    sceneItemEnabled: true,
  })
  log.info('[OBS Setup] Created', inputKind, 'for', game)
  return { inputCreated: true, inputUpgraded: false }
}

/** Re-target capture to the active game window right before recording starts. */
export async function retargetUpForgeCapture(obs: OBSWebSocket, game: string): Promise<void> {
  await ensureUpForgeCapture(obs, game)
}

export async function setupUpForgeScene(
  obs: OBSWebSocket,
  game = 'valorant',
): Promise<ObsSetupResult> {
  let sceneCreated = false
  let inputCreated = false
  let inputUpgraded = false

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

    await obs.call('SetCurrentProgramScene', { sceneName: UPFORGE_SCENE_NAME })

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

    return { ok: true, sceneCreated, inputCreated, inputUpgraded }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.warn('[OBS Setup] setupUpForgeScene failed:', msg)
    return { ok: false, sceneCreated, inputCreated, inputUpgraded, error: msg }
  }
}
