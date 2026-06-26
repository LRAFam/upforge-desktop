import { Notification } from 'electron'
import { join } from 'path'

export interface AppNotificationOptions {
  title: string
  body: string
  silent?: boolean
  onClick?: () => void
  /** Allow during an active match recording (default: block automated toasts). */
  allowDuringRecording?: boolean
}

/** Set from main — suppresses focus-stealing toasts while OBS is capturing. */
let isMatchRecordingActive: () => boolean = () => false

export function setMatchRecordingGuard(fn: () => boolean): void {
  isMatchRecordingActive = fn
}

const APP_ICON = join(__dirname, '../../resources/icon.ico')

/** Strong refs until close — prevents GC and lets us dismiss stale toasts on Windows. */
let activeToasts: Notification[] = []

/**
 * Dismiss toasts this app currently has open.
 *
 * Windows only shows one banner toast per app at a time. Posting another without
 * closing the first re-opens the old toast instead of showing new content.
 */
export function dismissActiveToasts(): void {
  for (const toast of activeToasts) {
    try { toast.close() } catch { /* ignore */ }
  }
  activeToasts = []
}

let lastToastKey = ''
let lastToastAt = 0
const TOAST_DEDUPE_MS = 60_000

/** Show a native OS notification, replacing any toast already on screen. */
export function showAppNotification({
  title,
  body,
  silent,
  onClick,
  allowDuringRecording = false,
}: AppNotificationOptions): void {
  if (!Notification.isSupported()) return

  if (!allowDuringRecording && isMatchRecordingActive()) return

  const key = `${title}\0${body}`
  const now = Date.now()
  if (key === lastToastKey && now - lastToastAt < TOAST_DEDUPE_MS) return
  lastToastKey = key
  lastToastAt = now

  dismissActiveToasts()

  const notification = new Notification({
    title,
    body,
    silent,
    icon: APP_ICON,
  })
  const remove = () => {
    activeToasts = activeToasts.filter((n) => n !== notification)
  }
  notification.on('close', remove)
  notification.on('failed', remove)
  if (onClick) {
    notification.on('click', () => {
      onClick()
      notification.close()
    })
  }
  activeToasts.push(notification)
  notification.show()
}
