import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { PracticeAppointments } from '../practice-appointment'
import { isTrustedRendererUrl } from '../renderer-trust'
export function setupPracticeAppointmentHandlers(ipcMain: IpcMain, service: PracticeAppointments): void {
  const trusted = (e: IpcMainInvokeEvent) => !!e.senderFrame && isTrustedRendererUrl(e.senderFrame.url)
  ipcMain.handle('practice-appointment:current', e => trusted(e) ? service.current() : null)
  ipcMain.handle('practice-appointment:choose', (e, id) => trusted(e) ? service.choose(id) : { ok: false })
  ipcMain.handle('practice-appointment:change', (e, id, action, data) => trusted(e) ? service.change(id, action, data) : null)
  ipcMain.handle('practice-appointment:boundary', e => trusted(e) ? service.boundary() : undefined)
  ipcMain.handle('practice-appointment:report-view', (e, input) => trusted(e) ? service.reportView(input) : 'retry')
}
