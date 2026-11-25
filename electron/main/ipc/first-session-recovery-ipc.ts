import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { FirstSessionRecovery } from '../first-session-recovery'
import { isTrustedRendererUrl } from '../renderer-trust'

export function setupFirstSessionRecoveryHandlers(ipcMain: IpcMain, recovery: FirstSessionRecovery): void {
  const trusted = (event: IpcMainInvokeEvent) => !!event.senderFrame && isTrustedRendererUrl(event.senderFrame.url)
  ipcMain.handle('first-session-recovery:current', event => trusted(event) ? recovery.currentTile() : null)
  ipcMain.handle('first-session-recovery:exposed', (event, id: unknown) => trusted(event) && typeof id === 'string' ? recovery.exposed(id) : undefined)
  ipcMain.handle('first-session-recovery:enter', (event, id: unknown) => trusted(event) && typeof id === 'string' ? recovery.enter(id) : { ok: false })
  ipcMain.handle('first-session-recovery:dismiss', (event, id: unknown) => trusted(event) && typeof id === 'string' ? recovery.dismiss(id) : undefined)
  ipcMain.handle('first-session-recovery:report-view', (event, input: unknown) => trusted(event) && input && typeof input === 'object' ? recovery.reportView(input as Parameters<FirstSessionRecovery['reportView']>[0]) : undefined)
}
