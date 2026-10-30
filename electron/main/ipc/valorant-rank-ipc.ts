import { app, type BrowserWindow, type IpcMain } from 'electron'
import path from 'node:path'
import log from 'electron-log'
import type { AuthManager } from '../auth-manager'
import type { RiotLocalApi } from '../riot-local-api'
import { ValorantRankService, captureMmrBody, fileRankStore } from '../valorant-rank'
import { parseCompetitiveUpdates, type ValorantRankLive } from '../valorant-mmr'
import { appendRankedGames, fileRankedLogStore } from '../valorant-ranked-log'

/** Seconds after Riot's match-end MMR push before we read it (Riot updates the body shortly after). */
const MATCH_END_DELAY_MS = 5_000

/**
 * Valorant rank from the Riot client: IPC + triggers.
 * - `valorant:get-rank` → last known rank for this UpForge user (live or saved), or null.
 * - `valorant:refresh-rank` → read now (throttled like focus).
 * - `valorant:capture-mmr` (dev builds only) → save one raw MMR body to userData/riot-captures.
 * Pushes `valorant:rank-updated` to the main window when a new rank arrives.
 */
export function setupValorantRankHandlers(opts: {
  ipcMain: IpcMain
  riot: RiotLocalApi
  auth: AuthManager
  getWindow: () => BrowserWindow | null
  isDev: boolean
}): ValorantRankService {
  const { ipcMain, riot, auth, getWindow, isDev } = opts
  const userData = app.getPath('userData')
  // Rolling log of the player's ranked games (session coach, pace). Local only, capped.
  const rankedLog = fileRankedLogStore(path.join(userData, 'valorant-ranked-games.json'))
  const currentUserId = (): number | null => {
    const id = auth.getUser()?.id
    return typeof id === 'number' ? id : null
  }
  const service = new ValorantRankService({
    // Competitive-update history lets us work out rank shields (Riot sends no shield field).
    fetchMmr: async () => {
      const mmr = await riot.fetchOwnMmr()
      if (!mmr) return null
      const updates = await riot.fetchOwnCompetitiveUpdates().catch(() => null)
      const userId = currentUserId()
      const parsed = parseCompetitiveUpdates(updates)
      if (userId != null && parsed) appendRankedGames(rankedLog, userId, mmr.puuid, parsed)
      return { ...mmr, updates: updates ?? undefined }
    },
    postSnapshot: async (rank: ValorantRankLive) => {
      if (!auth.isAuthenticated()) return false
      try {
        await auth.getApi().post('/api/valorant/rank-snapshot', {
          puuid: rank.puuid,
          competitive_tier: rank.tier,
          ranked_rating: rank.rr,
          last_rr_change: rank.lastChange,
          season_id: rank.seasonId,
          match_id: rank.lastMatchId,
          state: rank.state,
          source: rank.source,
        })
        return true
      } catch (err) {
        log.warn('[Rank] Snapshot not saved:', (err as { status?: number; message?: string })?.status ?? (err as Error)?.message)
        return false
      }
    },
    notify: (rank) => {
      const win = getWindow()
      if (win && !win.isDestroyed()) win.webContents.send('valorant:rank-updated', rank)
    },
    currentUserId,
    ...fileRankStore(path.join(userData, 'valorant-rank.json')),
  })

  riot.setMmrChangedListener(() => {
    setTimeout(() => { void service.refresh('match_end') }, MATCH_END_DELAY_MS)
  })

  ipcMain.handle('valorant:get-rank', () => service.current())
  ipcMain.handle('valorant:refresh-rank', () => service.refresh('focus'))
  // The signed-in user's logged ranked games, oldest first ([] for anyone else).
  ipcMain.handle('valorant:ranked-games', () => {
    const userId = currentUserId()
    const stored = rankedLog.read()
    return userId != null && stored && stored.userId === userId ? stored.games : []
  })
  ipcMain.handle('valorant:capture-mmr', async () => {
    if (!isDev) return { ok: false, error: 'Only available in development builds.' }
    return captureMmrBody(() => riot.fetchOwnMmr(), path.join(userData, 'riot-captures'))
  })
  return service
}
