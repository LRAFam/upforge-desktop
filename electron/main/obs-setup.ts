/**
 * Creates a minimal UpForge OBS scene via WebSocket — display capture, cursor hidden.
 */

import type OBSWebSocket from 'obs-websocket-js'
import log from 'electron-log'

export const UPFORGE_SCENE_NAME = 'UpForge'
export const UPFORGE_INPUT_NAME = 'UpForge Capture'

export interface ObsSetupResult {
  ok: boolean
  sceneCreated: boolean
  inputCreated: boolean
  error?: string
}

export async function setupUpForgeScene(obs: OBSWebSocket): Promise<ObsSetupResult> {
  let sceneCreated = false
  let inputCreated = false

  try {
    const sceneList = await obs.call('GetSceneList') as unknown as { scenes?: { sceneName: string }[] }
    const hasScene = sceneList.scenes?.some((s) => s.sceneName === UPFORGE_SCENE_NAME) ?? false

    if (!hasScene) {
      await obs.call('CreateScene', { sceneName: UPFORGE_SCENE_NAME })
      sceneCreated = true
      log.info('[OBS Setup] Created scene:', UPFORGE_SCENE_NAME)
    }

    const inputList = await obs.call('GetInputList') as { inputs?: { inputName: string }[] }
    const hasInput = inputList.inputs?.some((i) => i.inputName === UPFORGE_INPUT_NAME) ?? false

    if (!hasInput) {
      const inputKind = process.platform === 'darwin' ? 'display_capture' : 'monitor_capture'
      const inputSettings: Record<string, string | number | boolean> =
        process.platform === 'darwin'
          ? { show_cursor: false }
          : { monitor: 0, capture_cursor: false }

      await obs.call('CreateInput', {
        sceneName: UPFORGE_SCENE_NAME,
        inputName: UPFORGE_INPUT_NAME,
        inputKind,
        inputSettings: inputSettings as never,
        sceneItemEnabled: true,
      })
      inputCreated = true
      log.info('[OBS Setup] Created input:', UPFORGE_INPUT_NAME, inputKind)
    } else {
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

    return { ok: true, sceneCreated, inputCreated }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.warn('[OBS Setup] setupUpForgeScene failed:', msg)
    return { ok: false, sceneCreated, inputCreated, error: msg }
  }
}
