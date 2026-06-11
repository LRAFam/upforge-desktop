/**
 * Push UpForge recording settings into OBS via WebSocket.
 *
 * SetProfileParameter only writes the profile file — encoder bitrate often stays
 * unchanged (especially when OBS Output Mode is Advanced). SetVideoSettings and
 * SetRecordDirectory use APIs that apply immediately before recording starts.
 */

import { app } from 'electron'
import { join } from 'path'
import log from 'electron-log'
import type OBSWebSocket from 'obs-websocket-js'
import type { RecorderConfig } from './recorder'
import type { AppSettings } from './settings-manager'
import { getRecordingPresetValues, formatRecordingLabel } from './recording-preset'

export function buildRecorderConfig(settings: AppSettings, allowCreator = true): RecorderConfig {
  const preset = getRecordingPresetValues(
    settings.recordingPreset === 'creator' && allowCreator ? 'creator' : 'coaching',
  )
  return {
    quality: preset.quality,
    bitrate: preset.bitrate,
    fps: preset.fps,
    manageObsVideo: preset.manageObsVideo,
    audioEnabled: settings.audioEnabled,
    savePath: settings.savePath || join(app.getPath('userData'), 'recordings'),
    captureMonitor: settings.captureMonitor,
  }
}

export interface ObsApplyResult {
  ok: boolean
  outputMode: string | null
  outputWidth: number | null
  outputHeight: number | null
  warnings: string[]
}

async function getProfileParam(
  obs: OBSWebSocket,
  parameterCategory: string,
  parameterName: string,
): Promise<string | null> {
  try {
    const res = await obs.call('GetProfileParameter', {
      parameterCategory,
      parameterName,
    }) as { parameterValue?: string | null }
    return res.parameterValue ?? null
  } catch {
    return null
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
      `[OBS Output] SetProfileParameter ${parameterCategory}/${parameterName} failed:`,
      err instanceof Error ? err.message : err,
    )
  }
}

export async function applyObsRecordingSettings(
  obs: OBSWebSocket,
  config: RecorderConfig,
): Promise<ObsApplyResult> {
  const { cx, cy } = config.quality === '1080p'
    ? { cx: 1920, cy: 1080 }
    : { cx: 1280, cy: 720 }
  const bitrateKbps = Math.round(config.bitrate * 1000)
  const fps = config.fps ?? 30
  const savePath = config.savePath
  const warnings: string[] = []

  const modeBefore = await getProfileParam(obs, 'Output', 'Mode')
  if (modeBefore === 'Advanced') {
    warnings.push(
      'OBS Output Mode is Advanced — recordings may be very large until you switch to Simple ' +
      '(OBS Settings → Output → Output Mode → Simple) and restart OBS.',
    )
  }

  await setProfileParam(obs, 'Output', 'Mode', 'Simple')
  await setProfileParam(obs, 'SimpleOutput', 'RecFormat', 'mp4')
  await setProfileParam(obs, 'SimpleOutput', 'RecQuality', 'Small')
  await setProfileParam(obs, 'SimpleOutput', 'RecRB', String(bitrateKbps))

  try {
    await obs.call('SetRecordDirectory', { recordDirectory: savePath })
  } catch (err) {
    log.warn('[OBS Output] SetRecordDirectory failed:', err instanceof Error ? err.message : err)
    await setProfileParam(obs, 'SimpleOutput', 'FilePath', savePath)
  }

  if (config.manageObsVideo !== false) {
    try {
      await obs.call('SetVideoSettings', {
        baseWidth: cx,
        baseHeight: cy,
        outputWidth: cx,
        outputHeight: cy,
        fpsNumerator: fps,
        fpsDenominator: 1,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.warn('[OBS Output] SetVideoSettings failed:', msg)
      if (msg.includes('OutputRunning') || msg.includes('output is active')) {
        warnings.push('Could not set OBS video resolution — stop any active OBS output and reconnect.')
      }
    }
  }

  const outputMode = await getProfileParam(obs, 'Output', 'Mode')
  let outputWidth: number | null = null
  let outputHeight: number | null = null

  try {
    const video = await obs.call('GetVideoSettings') as {
      outputWidth?: number
      outputHeight?: number
    }
    outputWidth = video.outputWidth ?? null
    outputHeight = video.outputHeight ?? null
    if (config.manageObsVideo !== false && outputWidth && outputWidth > cx) {
      warnings.push(`OBS output resolution is ${outputWidth}×${outputHeight} (expected ${cx}×${cy}).`)
    }
  } catch (err) {
    log.warn('[OBS Output] GetVideoSettings failed:', err)
  }

  const recRb = await getProfileParam(obs, 'SimpleOutput', 'RecRB')
  const label = formatRecordingLabel(config.quality, config.bitrate, fps)
  log.info(
    `[OBS Output] Applied ${label}${config.manageObsVideo === false ? ' (OBS video settings unchanged)' : ''} → ${savePath} ` +
    `(mode=${outputMode ?? '?'}, ${outputWidth ?? '?'}×${outputHeight ?? '?'}, RecRB=${recRb ?? '?'} kbps)`,
  )

  if (warnings.length) {
    for (const w of warnings) log.warn('[OBS Output]', w)
  }

  return {
    ok: warnings.length === 0,
    outputMode,
    outputWidth,
    outputHeight,
    warnings,
  }
}
