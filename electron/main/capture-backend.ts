/**
 * Shared logic for selecting the active match recorder backend.
 */

import type { ActiveMatchRecorder } from './match-recorder'
import { Recorder } from './recorder'
import { DesktopRecorder } from './desktop-recorder'
import { OBSRecorder } from './obs-recorder'
import type { SettingsManager } from './settings-manager'

export type RecordingBackend = 'obs' | 'ffmpeg' | 'desktop'

export interface CaptureBackendContext {
  ffmpegOk: boolean
  ffmpegRecorder: Recorder
  desktopRecorder: DesktopRecorder
  obsRecorder: OBSRecorder
  settingsManager: SettingsManager | undefined
}

export function resolveCaptureBackend(ctx: CaptureBackendContext): RecordingBackend {
  if (ctx.settingsManager?.get().obsEnabled && ctx.obsRecorder.isConnected()) return 'obs'
  const wantsAudio = ctx.settingsManager?.get().audioEnabled !== false
  if (process.platform === 'win32' && ctx.ffmpegOk) {
    if (wantsAudio && ctx.ffmpegRecorder.getAudioMode() === false) return 'desktop'
    return 'ffmpeg'
  }
  return 'desktop'
}

export function recorderForBackend(
  backend: RecordingBackend,
  ctx: CaptureBackendContext,
): ActiveMatchRecorder {
  switch (backend) {
    case 'obs': return ctx.obsRecorder
    case 'ffmpeg': return ctx.ffmpegRecorder
    default: return ctx.desktopRecorder
  }
}

export function selectActiveRecorder(ctx: CaptureBackendContext): ActiveMatchRecorder {
  return recorderForBackend(resolveCaptureBackend(ctx), ctx)
}

export function formatRecordingFailure(
  backend: RecordingBackend,
  lastError: string | null,
): string {
  if (lastError) return `Recording failed: ${lastError}`
  switch (backend) {
    case 'obs':
      return 'Recording file was not created — OBS may have stopped recording or disconnected.'
    case 'ffmpeg':
      return 'Recording file was not created — ffmpeg may have failed to start. Check disk space and reinstall the app if the problem persists.'
    default:
      return process.platform === 'darwin'
        ? 'Recording file was not created — check Screen Recording permission in System Settings → Privacy & Security.'
        : 'Recording file was not created — desktop capture may have failed. Check display capture permissions.'
  }
}

export function formatCorruptRecordingMessage(
  backend: RecordingBackend,
  sizeMB: string,
): string {
  const hint = backend === 'desktop'
    ? 'Check Screen Recording permission and available disk space.'
    : backend === 'obs'
      ? 'OBS may have stopped mid-match — check OBS logs.'
      : 'Check your ffmpeg setup and disk space.'
  return `Recording appears corrupt or empty (${sizeMB} MB). ${hint}`
}
