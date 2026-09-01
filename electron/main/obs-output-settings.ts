/**
 * Push UpForge recording settings into OBS via WebSocket.
 *
 * SetProfileParameter only writes the profile file — encoder bitrate often stays
 * unchanged (especially when OBS Output Mode is Advanced). SetVideoSettings and
 * SetRecordDirectory use APIs that apply immediately before recording starts.
 */

import log from 'electron-log'
import type OBSWebSocket from 'obs-websocket-js'
import { applyCrashSafeObsRecFormat } from './obs-rec-format'
import type { RecorderConfig } from './recorder'
import type { AppSettings } from './settings-manager'
import { resolveRecordingOutput } from './recording-preset'
import { resolveRecordingSavePath } from './user-data-paths'
import { fitUpForgeCaptureToCanvas } from './obs-setup'

export function buildRecorderConfig(
  settings: AppSettings,
  allowCreator = true,
  userId: number | null = null,
): RecorderConfig {
  const preset = resolveRecordingOutput({
    recordingPreset: settings.recordingPreset,
    recordingQuality: settings.recordingQuality,
    allowCreator,
  })
  return {
    quality: preset.quality,
    bitrate: preset.bitrate,
    fps: preset.fps,
    manageObsVideo: preset.manageObsVideo,
    audioEnabled: settings.audioEnabled,
    savePath: resolveRecordingSavePath(settings.savePath, userId),
    captureMonitor: settings.captureMonitor,
    clipsOnly: settings.fullMatchRecording === false,
  }
}

export interface ObsApplyResult {
  ok: boolean
  /** True when recording must not start (e.g. Advanced mode still active). */
  blocking: boolean
  outputMode: string | null
  outputWidth: number | null
  outputHeight: number | null
  warnings: string[]
  errors: string[]
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
  obsStudioVersion?: string | null,
  options?: { outputsHot?: boolean },
): Promise<ObsApplyResult> {
  const { cx, cy } = config.quality === '1080p'
    ? { cx: 1920, cy: 1080 }
    : { cx: 1280, cy: 720 }
  const fps = config.fps ?? 30
  const savePath = config.savePath
  const warnings: string[] = []
  const errors: string[] = []

  const modeBefore = await getProfileParam(obs, 'Output', 'Mode')
  if (modeBefore === 'Advanced') {
    warnings.push(
      'OBS Output Mode is Advanced — recordings may be very large until you switch to Simple ' +
      '(OBS Settings → Output → Output Mode → Simple) and restart OBS.',
    )
  }

  await setProfileParam(obs, 'Output', 'Mode', 'Simple')
  const recFormat = await applyCrashSafeObsRecFormat(obs, obsStudioVersion)
  await setProfileParam(obs, 'SimpleOutput', 'RecQuality', 'Small')
  await setProfileParam(obs, 'SimpleOutput', 'RecRB', String(config.clipsOnly === true))

  try {
    await obs.call('SetRecordDirectory', { recordDirectory: savePath })
  } catch (err) {
    log.warn('[OBS Output] SetRecordDirectory failed:', err instanceof Error ? err.message : err)
    await setProfileParam(obs, 'SimpleOutput', 'FilePath', savePath)
  }

  const allowVideoSettings = config.allowVideoSettings !== false && !options?.outputsHot
  const manageVideo = config.manageObsVideo !== false && allowVideoSettings

  if (config.manageObsVideo !== false && !allowVideoSettings) {
    warnings.push('Skipped SetVideoSettings — OBS outputs hot or video mutation disallowed.')
  }

  if (manageVideo) {
    let videoSettingsMatch = false
    try {
      const current = await obs.call('GetVideoSettings') as {
        baseWidth?: number
        baseHeight?: number
        outputWidth?: number
        outputHeight?: number
        fpsNumerator?: number
        fpsDenominator?: number
      }
      videoSettingsMatch = current.baseWidth === cx
        && current.baseHeight === cy
        && current.outputWidth === cx
        && current.outputHeight === cy
        && current.fpsNumerator === fps
        && current.fpsDenominator === 1
    } catch (err) {
      log.warn('[OBS Output] Could not check current video settings before applying:', err)
    }

    try {
      if (videoSettingsMatch) {
        log.info(`[OBS Output] Video already ${cx}×${cy} @ ${fps} fps — skipping reset`)
      } else {
        await obs.call('SetVideoSettings', {
          baseWidth: cx,
          baseHeight: cy,
          outputWidth: cx,
          outputHeight: cy,
          fpsNumerator: fps,
          fpsDenominator: 1,
        })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.warn('[OBS Output] SetVideoSettings failed:', msg)
      if (msg.includes('OutputRunning') || msg.includes('output is active')) {
        warnings.push('Could not set OBS video resolution — stop any active OBS output and reconnect.')
      }
    }
    await fitUpForgeCaptureToCanvas(obs)
  }

  const outputMode = await getProfileParam(obs, 'Output', 'Mode')
  let blocking = false
  if (outputMode === 'Advanced') {
    blocking = true
    errors.push('advanced_output')
    warnings.push(
      'OBS is still in Advanced Output Mode after UpForge requested Simple — refusing to start recording.',
    )
  }

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
  const label = `${config.quality} · ${fps} fps · OBS Simple/Small quality`
  log.info(
    `[OBS Output] Applied ${label}${config.manageObsVideo === false ? ' (OBS video settings unchanged)' : ''} → ${savePath} ` +
    `(mode=${outputMode ?? '?'}, ${outputWidth ?? '?'}×${outputHeight ?? '?'}, replayBuffer=${recRb ?? '?'}, format=${recFormat})`,
  )

  if (warnings.length) {
    for (const w of warnings) log.warn('[OBS Output]', w)
  }

  return {
    ok: !blocking && warnings.length === 0,
    blocking,
    outputMode,
    outputWidth,
    outputHeight,
    warnings,
    errors,
  }
}
