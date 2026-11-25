import type { IpcMain } from 'electron'
import type { AuthManager } from '../auth-manager'
import { isTrustedRendererUrl } from '../renderer-trust'
import { achievementResponse, mergeAchievementLists } from '../../../src/lib/achievement-sync'
import type { AchievementList } from '../../../src/lib/account-achievements'

/** Auth stays in main. Pin each request to the account/token that supplied the local unlocks. */
export function setupAchievementHandlers(ipcMain: IpcMain, auth: AuthManager): void {
  ipcMain.handle('achievements:sync', async (event, userId: unknown, raw: unknown): Promise<AchievementList | null> => {
    if (event.senderFrame !== event.sender.mainFrame || !isTrustedRendererUrl(event.senderFrame.url)) return null
    const token = auth.getToken()
    const current = () => auth.getToken() === token && auth.getUser()?.id === userId
    if (!token || !Number.isSafeInteger(userId) || !current()) return null
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length > 50
      || Object.values(raw).some(at => typeof at !== 'string')) return null
    const local = mergeAchievementLists(raw as AchievementList)
    const config = { headers: { Authorization: `Bearer ${token}` } }
    try {
      const api = auth.getApi()
      const remote = achievementResponse((await api.get('/api/achievements', config)).data)
      if (!current()) return null
      const merged = mergeAchievementLists(remote, local)
      const pending = Object.entries(merged).filter(([id, at]) => remote[id] !== at)
      if (!pending.length) return merged
      const saved = achievementResponse((await api.post('/api/achievements', {
        achievements: pending.map(([id, unlocked_at]) => ({ id, unlocked_at })),
      }, config)).data)
      return current() ? mergeAchievementLists(merged, saved) : null
    } catch {
      // Local unlocks remain saved. Next load/run retries; don't expose HTTP credentials through IPC.
      return null
    }
  })
}
