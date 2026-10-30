/** Coach marketplace (UI v3): read-only IPC. Booking and payment stay on the web. */
import type { IpcMain } from 'electron'
import type { AuthManager } from '../auth-manager'

const id = (v: unknown): number => (typeof v === 'number' && Number.isSafeInteger(v) && v > 0 ? v : -1)

export function setupMarketplaceHandlers(ipcMain: IpcMain, auth: AuthManager): void {
  ipcMain.handle('market:list-coaches', (_e, game: unknown) => auth.fetchMarketplaceCoaches(typeof game === 'string' ? game : null))
  ipcMain.handle('market:get-coach', (_e, coachId: unknown) => auth.fetchMarketplaceCoach(id(coachId)))
  ipcMain.handle('market:review-pricing', (_e, coachId: unknown) => auth.fetchCoachReviewPricing(id(coachId)))
  ipcMain.handle('market:my-sessions', () => auth.fetchMyCoachingSessions())
  ipcMain.handle('market:my-reviews', () => auth.fetchMyPaidCoachReviews())
}
