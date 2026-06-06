/**
 * Push UpForge recording settings into the active OBS profile via WebSocket.
 * OBS Simple Output must use RecQuality=Small so RecRB (Kbps) controls file size.
 */

import { app } from 'electron'
import { join } from 'path'
import log from 'electron-log'
import type OBSWebSocket from 'obs-websocket-js'
import type { RecorderConfig } from './recorder'
import type { AppSettings } from './settings-manager'
import { RECORDING_PRESET, RECORDING_PRESET_LABEL } from './recording-preset'

export function buildRecorderConfig(settings: AppSettings): RecorderConfig {
  return {
    quality: RECORDING_PRESET.quality,
    bitrate: RECORDING_PRESET.bitrate,
    fps: RECORDING_PRESET.fps,
    audioEnabled: settings.audioEnabled,
    savePath: settings.savePath || join(app.getPath('userData'), 'recordings'),
    captureMonitor: settings.captureMonitor,
  }
}

async function setProfileParam(
  obs: OBSWebSocket,
  parameterCategory: string,
  parameterName: string,
  parameterValue: string,
): Promise<void> {
  try {
    await obs.call('SetProfileParameter', { parameterCategory, parameterName, parameterValue })
  } catch (err) {
    log.warn(
      `[OBS Output] SetProfileParameter ${parameterCategory}/${parameterName} failed (non-fatal):`,
      err instanceof Error ? err.message : err,
    )
  }
}

export async function applyObsRecordingSettings(
  obs: OBSWebSocket,
  config: RecorderConfig,
): Promise<void> {
  const { cx, cy } = config.quality === '1080p'
    ? { cx: 1920, cy: 1080 }
    : { cx: 1280, cy: 720 }
  const bitrateKbps = Math.round(config.bitrate * 1000)
  const fps = config.fps ?? 30
  const savePath = config.savePath

  const params: Array<[string, string, string]> = [
    ['Output', 'Mode', 'Simple'],
    ['SimpleOutput', 'FilePath', savePath],
    ['SimpleOutput', 'RecFormat', 'mp4'],
    // Small = explicit bitrate via RecRB (not quality presets that ignore RecRB)
    ['SimpleOutput', 'RecQuality', 'Small'],
    ['SimpleOutput', 'RecRB', String(bitrateKbps)],
    ['Video', 'OutputCX', String(cx)],
    ['Video', 'OutputCY', String(cy)],
    ['Video', 'FPSType', '0'],
    ['Video', 'FPSCommon', String(fps)],
  ]

  for (const [category, name, value] of params) {
    await setProfileParam(obs, category, name, value)
  }

  log.info(`[OBS Output] Applied ${RECORDING_PRESET_LABEL} → ${savePath}`)
}
