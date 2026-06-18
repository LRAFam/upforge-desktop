/**
 * auth-ipc.ts
 * IPC handlers for authentication, profile, stats, analyses, and squad presence.
 */

import { IpcMain, BrowserWindow, shell } from 'electron'
import log from 'electron-log'
import { AuthManager } from '../auth-manager'
import type { MatchRecorder } from '../match-recorder'
import { GameDetector } from '../game-detector'
import { UploadManager } from '../upload-manager'
import { cancelAllPollingTimers } from './api-helpers'
import { normalizeToAcs } from '../combat-score'
import {
  fetchRecordingPlaybackUrl,
  isLikelyBrowserPlayableLocal,
  resolveCloudFirstPlaybackUrl,
} from '../recording-playback'

export function setupAuthHandlers(
  ipcMain: IpcMain,
  auth: AuthManager,
  getActiveRecorder: () => MatchRecorder,
  gameDetector: GameDetector,
  uploadManager?: UploadManager,
  endActiveMatch?: (game: string) => Promise<{ ok: boolean; reason?: string }>,
  onLoginSuccess?: () => void,
  onLogout?: () => void,
  getLocalRecordingPathByJobId?: (jobId: string) => string | null,
): void {
  // ── Auth ──────────────────────────────────────────────────────────────────

  ipcMain.handle('auth:login', async (_e, { email, password }) => {
    log.info('[IPC] auth:login invoked')
    try {
      const result = await auth.login(email, password)
      log.info('[IPC] auth:login result:', result.ok, result.error)
      if (result.ok) {
        onLoginSuccess?.()
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
    const recorder = getActiveRecorder()
    if (recorder.isRecording()) {
      const game = gameDetector.currentGame() ?? 'valorant'
      if (endActiveMatch) {
        try { await endActiveMatch(game) } catch { /* ignore */ }
      } else {
        try { await recorder.stop() } catch { /* ignore */ }
      }
    }
    uploadManager?.abort()
    cancelAllPollingTimers()
    onLogout?.()
    return auth.logout()
  })

  ipcMain.handle('auth:get-user', async () => {
    return auth.getUser()
  })

  ipcMain.handle('auth:refresh-user', async () => {
    const user = await auth.fetchUser()
    if (user) onLoginSuccess?.()
    return user
  })

  ipcMain.handle('auth:load-stored', async () => {
    return auth.loadStoredToken()
  })

  // ── Profile & stats ───────────────────────────────────────────────────────

  ipcMain.handle('profile:get', async () => {
    return auth.fetchProfile()
  })

  ipcMain.handle('billing:open-portal', async () => {
    const result = await auth.createBillingPortalSession()
    if (!result.ok) return result
    await shell.openExternal(result.url)
    return { ok: true as const }
  })

  ipcMain.handle('stats:rr-history', async () => {
    return auth.fetchRRHistory()
  })

  ipcMain.handle('progress:playstyle-profile', async () => {
    return auth.fetchPlaystyleProfile()
  })

  // ── Analyses ──────────────────────────────────────────────────────────────

  ipcMain.handle('analyses:get', async (_e, { limit } = {}) => {
    return auth.fetchAnalyses(limit ?? 10)
  })

  ipcMain.handle('analyses:submit-feedback', async (_e, {
    analysisId,
    rating,
    feedbackText,
  }: {
    analysisId: number
    rating: 'thumbs_up' | 'thumbs_down'
    feedbackText?: string
  }) => {
    if (!auth.getToken()) return { ok: false, error: 'Not logged in' }
    return auth.submitAnalysisFeedback(analysisId, {
      rating,
      feedback_text: feedbackText?.trim() || undefined,
    })
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
      const summaryRounds = (md.roundSummaries as unknown[] | undefined)?.length ?? 0
      const scoreRounds = (md.finalScore?.allyScore ?? 0) + (md.finalScore?.enemyScore ?? 0)
      const rounds = summaryRounds > 0 ? summaryRounds : (scoreRounds > 0 ? scoreRounds : null)
      const finalStats = md.finalStats
        ? {
            ...md.finalStats,
            score: normalizeToAcs(md.finalStats.score, rounds),
          }
        : null
      const teamSnapshot = (md.teamSnapshot as Array<{ score?: number }> | undefined)?.map((p) => ({
        ...p,
        score: normalizeToAcs(p.score, rounds) ?? 0,
      })) ?? []
      const jobArchiveId = typeof analysis.archive_id === 'string' ? analysis.archive_id : null
      const localFallback = analysis.job_id && getLocalRecordingPathByJobId
        ? getLocalRecordingPathByJobId(analysis.job_id)
        : null
      const playback = await resolveCloudFirstPlaybackUrl({
        auth,
        analysisId: id,
        archiveId: jobArchiveId,
        inlineRecordingUrl: analysis.recording_url,
        localPath: localFallback && isLikelyBrowserPlayableLocal(localFallback) ? localFallback : null,
      })
      const videoPath = playback.url

      return {
        id: String(analysis.id),
        analysisId: analysis.id as number,
        archiveId: playback.archiveId,
        videoPath,
        map: analysis.map ?? md.map ?? null,
        agent: analysis.agent ?? md.agent ?? null,
        game: (analysis.game as string) ?? (md.game as string) ?? 'valorant',
        gameMode: md.gameMode ?? md.game_mode ?? null,
        recordedAt: new Date(analysis.created_at).getTime(),
        kills: md.playerKills ?? md.killEvents?.filter((k: any) => k.killerName === 'You' || k.type === 'kill') ?? [],
        deaths: md.playerDeaths ?? md.killEvents?.filter((k: any) => k.victimName === 'You' || k.type === 'death') ?? [],
        roundSummaries: md.roundSummaries ?? [],
        finalStats,
        teamSnapshot,
        spatialSummary: md.spatialSummary ?? null,
        spikePlants: md.spikePlants ?? [],
        spikeDefuses: md.spikeDefuses ?? [],
        spikeDetonations: md.spikeDetonations ?? [],
        firstBloods: md.firstBloods ?? [],
      }
    } catch {
      return null
    }
  })

  ipcMain.handle('analyses:refresh-playback', async (_e, { id }: { id: number }) => {
    if (!id || Number.isNaN(id)) return null
    try {
      const res = await auth.getApi().get(`/api/analysis/${id}`)
      const analysis = res.data?.analysis
      if (!analysis) return fetchRecordingPlaybackUrl(auth, id)
      const playback = await resolveCloudFirstPlaybackUrl({
        auth,
        analysisId: id,
        archiveId: typeof analysis.archive_id === 'string' ? analysis.archive_id : null,
        inlineRecordingUrl: analysis.recording_url,
      })
      return playback.url
    } catch {
      return fetchRecordingPlaybackUrl(auth, id)
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
    await auth.sendPresence(getActiveRecorder().isRecording(), gameDetector.currentGame())
    return { ok: true }
  })
}
