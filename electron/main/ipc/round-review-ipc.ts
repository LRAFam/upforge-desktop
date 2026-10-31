import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { AuthManager } from '../auth-manager'
import { isTrustedRendererUrl } from '../renderer-trust'
import { getRoundReview, getRoundReviewAllowance, listRoundReviews, requestRoundReview } from '../round-review'

export function setupRoundReviewHandlers(ipcMain: IpcMain, auth: AuthManager): void {
  // Only the app's own windows may read or spend round reviews, and only when signed in.
  const refusal = (event: IpcMainInvokeEvent): { ok: false; error: string } | null => {
    if (!event.senderFrame || !isTrustedRendererUrl(event.senderFrame.url)) return { ok: false, error: 'Untrusted request' }
    if (!auth.isAuthenticated()) return { ok: false, error: 'Not signed in' }
    return null
  }
  ipcMain.handle('round-review:allowance', (event) => refusal(event) ?? getRoundReviewAllowance(auth.getApi()))
  ipcMain.handle('round-review:list', (event, jobId: unknown) => refusal(event) ?? listRoundReviews(auth.getApi(), jobId))
  ipcMain.handle('round-review:get', (event, jobId: unknown, round: unknown) => refusal(event) ?? getRoundReview(auth.getApi(), jobId, round))
  ipcMain.handle('round-review:request', (event, jobId: unknown, round: unknown) => refusal(event) ?? requestRoundReview(auth.getApi(), jobId, round))
}
