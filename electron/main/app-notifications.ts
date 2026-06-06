import { Notification } from 'electron'

export interface AppNotificationOptions {
  title: string
  body: string
  silent?: boolean
}

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
export function showAppNotification({ title, body, silent }: AppNotificationOptions): void {
  if (!Notification.isSupported()) return

  dismissActiveToasts()

  const notification = new Notification({ title, body, silent })
  const remove = () => {
    activeToasts = activeToasts.filter((n) => n !== notification)
  }
  notification.on('close', remove)
  notification.on('failed', remove)
  activeToasts.push(notification)
  notification.show()
}
