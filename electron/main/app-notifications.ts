import { Notification } from 'electron'
import { join } from 'path'

export interface AppNotificationOptions {
  title: string
  body: string
  silent?: boolean
  onClick?: () => void
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

/** Show a native OS notification, replacing any toast already on screen. */
export function showAppNotification({ title, body, silent, onClick }: AppNotificationOptions): void {
  if (!Notification.isSupported()) return

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
