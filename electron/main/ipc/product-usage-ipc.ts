import { BrowserWindow, powerMonitor, type IpcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import log from 'electron-log'
import type { AuthManager } from '../auth-manager'
import { isTrustedRendererUrl } from '../renderer-trust'
import { UsageTracker, USAGE_FEATURES, type UsageFeature } from '../../../src/lib/product-usage'

const trackers = new Map<number, UsageTracker>()

export function trackUsageAction(senderId: number, feature: UsageFeature): void {
  trackers.get(senderId)?.action(feature)
}

export function setupProductUsageHandlers(ipcMain: IpcMain, auth: AuthManager): void {
  ipcMain.handle('product-usage:sample', (event, payload: unknown) => {
    if (event.senderFrame !== event.sender.mainFrame || !isTrustedRendererUrl(event.senderFrame.url)) return
    if (!payload || typeof payload !== 'object') return
    const { feature, active, visit } = payload as { feature?: unknown; active?: unknown; visit?: unknown }
    if (feature !== null && !USAGE_FEATURES.includes(feature as UsageFeature)) return
    if (typeof active !== 'boolean' || typeof visit !== 'boolean') return
    let tracker = trackers.get(event.sender.id)
    if (!tracker) {
      tracker = new UsageTracker({
        now: () => performance.now(), uuid: randomUUID,
        send: async (ownerId, events) => {
          if (!auth.getToken() || auth.getUser()?.id !== ownerId) throw new Error('Usage owner changed')
          await auth.getApi().post('/api/product-usage', { channel: 'desktop', events })
        },
        failed: () => log.debug('[ProductUsage] Observation delivery incomplete'),
      })
      const senderId = event.sender.id
      trackers.set(senderId, tracker)
      event.sender.once('destroyed', () => { trackers.delete(senderId) })
    }
    const win = BrowserWindow.fromWebContents(event.sender)
    const focused = !!win && win.isFocused() && !win.isMinimized() && powerMonitor.getSystemIdleTime() < 60
    tracker.sample(auth.getToken() ? auth.getUser()?.id ?? null : null, feature as UsageFeature | null, active && focused, visit)
  })
}
