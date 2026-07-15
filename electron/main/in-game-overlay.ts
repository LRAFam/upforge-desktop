/**
 * Runtime gate for the in-game overlay. Code stays in the tree; flip to true when
 * overlay compatibility is ready again (Valorant exclusive fullscreen, etc.).
 */
import { showAppNotification } from './app-notifications'

export const IN_GAME_OVERLAY_ENABLED = false

export function isInGameOverlayEnabled(): boolean {
  return IN_GAME_OVERLAY_ENABLED
}

export function getSessionPollIntervalMs(overlayEnabled = isInGameOverlayEnabled()): number {
  return overlayEnabled ? 1_000 : 2_000
}

export function notifyOverlayUnavailable(): void {
  showAppNotification({
    title: 'Overlay temporarily unavailable',
    body: 'In-game overlay is turned off. F9 still confirms clip moments via notifications.',
    silent: true,
  })
}
