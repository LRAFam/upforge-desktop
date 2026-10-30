import type { IpcMain } from 'electron'
import type { AuthManager } from '../auth-manager'
import { isTrustedRendererUrl } from '../renderer-trust'
import { getRoundReview, getRoundReviewAllowance, listRoundReviews, requestRoundReview } from '../round-review'

export function setupRoundReviewHandlers(ipcMain: IpcMain, auth: AuthManager): void {
  ipcMain.handle('round-review:allowance', () => getRoundReviewAllowance(auth.getApi()))
  ipcMain.handle('round-review:list', (_e, jobId: unknown) => listRoundReviews(auth.getApi(), jobId))
  ipcMain.handle('round-review:get', (_e, jobId: unknown, round: unknown) => getRoundReview(auth.getApi(), jobId, round))
  ipcMain.handle('round-review:request', (event, jobId: unknown, round: unknown) => {
    // Spends a round review: only the app's own windows may ask.
    if (!event.senderFrame || !isTrustedRendererUrl(event.senderFrame.url)) return { ok: false, error: 'Untrusted request' }
    return requestRoundReview(auth.getApi(), jobId, round)
  })
}
