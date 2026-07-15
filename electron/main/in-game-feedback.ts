/**
 * In-game feedback — notifications + sound fallbacks when Valorant blocks the overlay.
 */

import { execFile } from 'child_process'
import { platform } from 'os'
import { showAppNotification } from './app-notifications'
import { isInGameOverlayEnabled } from './in-game-overlay'
import type { AppSettings, InGameFeedbackMode } from './settings-manager'

export type InGameFeedbackKind =
  | 'clip-saved'
  | 'clip-failed'
  | 'not-recording'
  | 'screenshot'
  | 'recording-started'

export interface InGameFeedbackOptions {
  kind: InGameFeedbackKind
  title: string
  body: string
  /** IPC channel for overlay UI (only sent when overlay mode is active) */
  overlayChannel?: string
  overlayData?: unknown
  /** Flash the overlay window briefly (0 = skip flash) */
  flashOverlayMs?: number
  beep?: 'success' | 'warning' | 'none'
}

export interface InGameFeedbackDeps {
  getSettings: () => AppSettings
  sendOverlayEvent: (channel: string, data?: unknown) => void
  flashOverlay: (durationMs: number) => void
}

export function getInGameFeedbackMode(settings: AppSettings): InGameFeedbackMode {
  return settings.inGameFeedback ?? 'notifications'
}

export function usesOverlayFeedback(mode: InGameFeedbackMode): boolean {
  if (!isInGameOverlayEnabled()) return false
  return mode === 'overlay' || mode === 'all'
}

const USER_INITIATED_FEEDBACK: ReadonlySet<InGameFeedbackKind> = new Set([
  'clip-saved',
  'clip-failed',
  'not-recording',
  'screenshot',
])

export function usesNotificationFeedback(mode: InGameFeedbackMode): boolean {
  if (!isInGameOverlayEnabled()) return true
  return mode === 'notifications' || mode === 'all'
}

/** Short beep — works in fullscreen when OS toasts may be suppressed. */
export function playFeedbackBeep(kind: 'success' | 'warning' = 'success'): void {
  if (platform() === 'win32') {
    const freq = kind === 'success' ? 880 : 520
    execFile(
      'powershell.exe',
      ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', `[console]::beep(${freq},90)`],
      { windowsHide: true },
      () => {},
    )
  } else if (platform() === 'darwin') {
    execFile('afplay', ['/System/Library/Sounds/Tink.aiff'], () => {})
  }
}

export function deliverInGameFeedback(deps: InGameFeedbackDeps, opts: InGameFeedbackOptions): void {
  const settings = deps.getSettings()
  const mode = getInGameFeedbackMode(settings)

  if (usesNotificationFeedback(mode)) {
    showAppNotification({
      title: opts.title,
      body: opts.body,
      silent: true,
      allowDuringRecording:
        opts.kind === 'recording-started'
        || opts.kind === 'clip-saved'
        || opts.kind === 'screenshot'
        || opts.kind === 'not-recording'
        || opts.kind === 'clip-failed',
    })
    if (
      opts.beep !== 'none'
      && settings.notificationSound
      && USER_INITIATED_FEEDBACK.has(opts.kind)
    ) {
      playFeedbackBeep(opts.beep ?? 'success')
    }
  } else if (
    opts.beep !== 'none'
    && settings.notificationSound
    && USER_INITIATED_FEEDBACK.has(opts.kind)
  ) {
    playFeedbackBeep(opts.beep ?? 'success')
  }

  if (usesOverlayFeedback(mode)) {
    if (opts.overlayChannel) {
      deps.sendOverlayEvent(opts.overlayChannel, opts.overlayData)
    }
    const flashMs = opts.flashOverlayMs ?? 3000
    if (flashMs > 0) deps.flashOverlay(flashMs)
  }
}
