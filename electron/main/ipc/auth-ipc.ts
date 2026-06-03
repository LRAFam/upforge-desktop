/**
 * auth-ipc.ts
 * IPC handlers for authentication, profile, stats, analyses, and squad presence.
 */

import { IpcMain, BrowserWindow } from 'electron'
import log from 'electron-log'
import { AuthManager } from '../auth-manager'
import { Recorder } from '../recorder'
import { GameDetector } from '../game-detector'
import { UploadManager } from '../upload-manager'
import { cancelAllPollingTimers } from './api-helpers'

export function setupAuthHandlers(
  ipcMain: IpcMain,
  auth: AuthManager,
  recorder: Recorder,
  gameDetector: GameDetector,
  uploadManager?: UploadManager,
): void {
  // ── Auth ──────────────────────────────────────────────────────────────────

  ipcMain.handle('auth:login', async (_e, { email, password }) => {
    log.info('[IPC] auth:login invoked')
    try {
      const result = await auth.login(email, password)
      log.info('[IPC] auth:login result:', result.ok, result.error)
      if (result.ok) {
        const win = BrowserWindow.fromWebContents(_e.sender)
        if (win) {
          win.setResizable(true)
          win.setMinimumSize(860, 580)
          win.setSize(980, 660)
          win.maximize()
        }
      }
      return result
    } catch (err) {
      log.error('[IPC] auth:login handler threw:', err)
      throw err
    }
  })

  ipcMain.handle('auth:logout', async () => {
    if (recorder.isRecording()) {
      try { await recorder.stop() } catch { /* ignore */ }
    }
    uploadManager?.abort()
    cancelAllPollingTimers()
    return auth.logout()
  })

  ipcMain.handle('auth:get-user', async () => {
    return auth.getUser()
  })

  ipcMain.handle('auth:load-stored', async () => {
    return auth.loadStoredToken()
  })

  // ── Profile & stats ───────────────────────────────────────────────────────

  ipcMain.handle('profile:get', async () => {
    return auth.fetchProfile()
  })

  ipcMain.handle('stats:rr-history', async () => {
    return auth.fetchRRHistory()
  })

  // ── Analyses ──────────────────────────────────────────────────────────────

  ipcMain.handle('analyses:get', async (_e, { limit } = {}) => {
    return auth.fetchAnalyses(limit ?? 10)
  })

  ipcMain.handle('analyses:get-detail', async (_e, { id }: { id: number }) => {
    try {
      const res = await auth.getApi().get(`/api/analysis/${id}`)
      const a = res.data?.analysis
      if (!a) return null
      const md = a.match_data ?? {}
      return {
        verdict: a.verdict ?? null,
        top_issue: a.top_issue ?? null,
        priority_improvements: a.priority_improvements ?? [],
        coaching_tags: a.coaching_tags ?? [],
        ally_score: md.finalScore?.allyScore ?? a.ally_score ?? null,
        enemy_score: md.finalScore?.enemyScore ?? a.enemy_score ?? null,
      }
    } catch {
      return null
    }
  })

  ipcMain.handle('analyses:get-timeline', async (_e, { id }: { id: number }) => {
    const token = auth.getToken()
    if (!token) return null
    try {
      const res = await auth.getApi().get(`/api/analysis/${id}`)
      const analysis = res.data?.analysis
      if (!analysis?.match_data) return null
      const md = analysis.match_data
      return {
        id: String(analysis.id),
        videoPath: null,
        map: analysis.map ?? md.map ?? null,
        agent: analysis.agent ?? md.agent ?? null,
        game: 'valorant',
        gameMode: md.gameMode ?? md.game_mode ?? null,
        recordedAt: new Date(analysis.created_at).getTime(),
        kills: md.killEvents?.filter((k: any) => k.type !== 'death') ?? md.kills ?? [],
        deaths: md.killEvents?.filter((k: any) => k.type === 'death') ?? md.deaths ?? [],
        roundSummaries: md.roundSummaries ?? [],
        finalStats: md.finalStats ?? null,
        teamSnapshot: md.teamSnapshot ?? [],
      }
    } catch {
      return null
    }
  })

  // ── Squad / Team ──────────────────────────────────────────────────────────

  ipcMain.handle('squad:get-team', async () => {
    try {
      return auth.fetchSquad()
    } catch {
      return { team: null, activity: [], presence: {}, error: 'Authentication error — please re-login' }
    }
  })

  ipcMain.handle('squad:send-presence', async (_e, { recording, game }: { recording: boolean; game: string | null }) => {
    await auth.sendPresence(recording, game)
    return { ok: true }
  })

  ipcMain.handle('squad:sync-presence', async () => {
    await auth.sendPresence(recorder.isRecording(), gameDetector.currentGame())
    return { ok: true }
  })
}
