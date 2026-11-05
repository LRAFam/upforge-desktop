/**
 * gaming-ipc.ts
 * IPC handlers for performance boost, aim trainer, Deadlock replays, CS2 detection,
 * and ForgeRank prestige. Also holds the crosshair→Godot conversion helper.
 */

import { BrowserWindow, IpcMain, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import log from 'electron-log'
import { AuthManager } from '../auth-manager'
import { getFrontendBaseUrl } from '../api-base'
import { GameDetector } from '../game-detector'
import { SettingsManager } from '../settings-manager'
import { openPathSafe } from '../shell-open'
import { PerformanceManager } from '../performance-manager'
import { TrainerBridge } from '../trainer-bridge'
import { buildTrainingSessionPayload, correlationInsightsFrom, drillConfigFromRequest } from '../trainer-payload'
import { sendOverlayData } from '../overlay-window'
import { apiPost } from './api-helpers'
import { dismissCoachingDrill } from '../coaching-drill-dismiss'
import { listRecentDemosInDir } from '../demo-finder'
import { SourceReplayUploader } from '../source-replay-uploader'
import { getDeadlockDetectionStatus } from '../deadlock-match-watcher'
import { ensureDeadlockSteamLaunchOptions } from '../deadlock-steam-setup'
import { resolveDeadlockReplayDirs } from '../deadlock-paths'
import { validateReplayUploadPath } from '../replay-upload-path'
import { isTrustedRendererUrl } from '../renderer-trust'

// ── Setup ─────────────────────────────────────────────────────────────────────

export function setupGamingHandlers(
  ipcMain: IpcMain,
  auth: AuthManager,
  settingsManager: SettingsManager,
  gameDetector: GameDetector,
  performanceManager?: PerformanceManager,
  trainerBridge?: TrainerBridge,
): void {
  const apiBase = process.env['VITE_API_URL'] || 'https://api.upforge.gg'

  // ── Performance ───────────────────────────────────────────────────────────

  ipcMain.handle('performance:get-status', async () => {
    if (!performanceManager) return { boosted: false, powerPlan: 'Unknown', platform: process.platform }
    return performanceManager.getStatus()
  })

  ipcMain.handle('performance:boost', async () => {
    if (!performanceManager) return []
    const currentGame = gameDetector.currentGame() ?? undefined
    return performanceManager.boost(currentGame)
  })

  ipcMain.handle('performance:restore', async () => {
    if (!performanceManager) return []
    return performanceManager.restore()
  })

  ipcMain.handle('performance:diagnostics', async () => {
    if (!performanceManager) return null
    return performanceManager.getDiagnostics()
  })

  ipcMain.handle('performance:kill-process', async (_e, name: string) => {
    if (!performanceManager) return { name: `Kill ${name}`, success: false, message: 'Not available' }
    return performanceManager.killProcess(name)
  })

  ipcMain.handle('performance:get-pregame-kill-list', async () => {
    return settingsManager.get().pregameKillList ?? []
  })

  ipcMain.handle('performance:set-pregame-kill-list', async (_e, list: string[]) => {
    settingsManager.save({ pregameKillList: list })
    return list
  })

  // ── Aim Trainer ───────────────────────────────────────────────────────────

  trainerBridge?.setResultCallback((result, launch) => {
    sendOverlayData('overlay:trainer-result', result)
    const token = auth.getToken()
    if (token) {
      const payload = buildTrainingSessionPayload(result, launch)
      apiPost(apiBase, '/api/training/sessions', JSON.stringify(payload), token)
        .then(() => log.info('[Trainer] Session synced to API'))
        .catch((err) => log.warn('[Trainer] Failed to sync session to API:', (err as Error)?.message))
    }
  })

  // A drill that ends without a result must clear the overlay's "in progress" card.
  trainerBridge?.setEndedCallback((ended) => {
    if (ended.reason !== 'completed') sendOverlayData('overlay:trainer-ended', ended)
  })

  ipcMain.handle('trainer:launch', async (_e, config: Record<string, unknown>) => {
    if (!trainerBridge) return { ok: false, error: 'Trainer not available' }
    try {
      const enrichedConfig = drillConfigFromRequest(config ?? {}, settingsManager.get())
      await trainerBridge.launch(enrichedConfig)
      sendOverlayData('overlay:trainer-started', {
        scenario: enrichedConfig.scenario,
        difficulty: enrichedConfig.difficulty,
        duration_seconds: enrichedConfig.duration_seconds,
      })
      return { ok: true, launchId: trainerBridge.lastLaunch?.launchId }
    } catch (err: any) {
      log.error('[IPC] trainer:launch error:', err)
      return { ok: false, error: err?.message ?? 'Failed to launch trainer' }
    }
  })

  ipcMain.handle('trainer:get-last-launch', () => trainerBridge?.lastLaunch ?? null)

  ipcMain.handle('trainer:kill', () => {
    trainerBridge?.kill()
    return { ok: true }
  })

  ipcMain.handle('trainer:get-history', async (_event, comparison?: import('../../../src/lib/training-result-metrics').TrainingComparisonRequest) => {
    const token = auth.getToken()
    if (!token) return null
    try {
      const res = await auth.getApi().get('/api/training/sessions', { params: { limit: 50, ...(comparison ? { scenario: comparison.scenario, difficulty: comparison.difficulty, duration_seconds: comparison.duration_seconds, scoring_version: comparison.scoring_version, before: comparison.before } : {}) } })
      return res.data ?? null
    } catch (err: any) {
      log.warn('[Trainer] Failed to fetch training history:', err?.message)
      return null
    }
  })

  ipcMain.handle('trainer:get-plan', async () => {
    const token = auth.getToken()
    if (!token) return null
    try {
      const res = await auth.getApi().get('/api/training/plan')
      return res.data?.plan ?? null
    } catch (err: any) {
      log.warn('[Trainer] Failed to fetch shared training plan:', err?.message)
      return null
    }
  })

  ipcMain.handle('trainer:get-coaching-drills', async () => {
    const token = auth.getToken()
    if (!token) return []
    try {
      const res = await auth.getApi().get('/api/drills')
      const data = res.data
      if (Array.isArray(data)) return data
      if (data && typeof data === 'object') return (data as Record<string, unknown>).active ?? []
      return []
    } catch (err: any) {
      log.warn('[Trainer] Failed to fetch coaching drills:', err?.message)
      return []
    }
  })

  ipcMain.handle('trainer:dismiss-coaching-drill', async (_e, id: unknown) => {
    const result = await dismissCoachingDrill(auth.getApi(), auth.getToken(), id)
    if (!result.ok) log.warn('[Trainer] Failed to dismiss coaching drill:', id, result.error)
    return result
  })

  ipcMain.handle('trainer:get-correlation', async () => {
    const token = auth.getToken()
    if (!token) return []
    try {
      const res = await auth.getApi().get('/api/training/correlation')
      return correlationInsightsFrom(res.data)
    } catch (err: any) {
      log.warn('[Trainer] Failed to fetch correlation insights:', err?.message)
      return []
    }
  })

  ipcMain.handle('trainer:get-benchmark', async () => {
    const token = auth.getToken()
    if (!token) return null
    try {
      const res = await auth.getApi().get('/api/training/benchmark')
      return res.data?.benchmark ?? null
    } catch (err: any) {
      log.warn('[Trainer] Failed to fetch benchmark:', err?.message)
      return null
    }
  })

  ipcMain.handle('trainer:get-ai-coaching', async () => {
    const token = auth.getToken()
    if (!token) return null
    try {
      const res = await auth.getApi().get('/api/training/coaching')
      return res.data ?? null
    } catch (err: any) {
      log.warn('[Trainer] Failed to fetch AI coaching:', err?.message)
      return null
    }
  })

  ipcMain.handle('trainer:get-leaderboard', async (_e, scenario: string, period = 'week', difficulty = 'medium', durationSeconds = 60) => {
    const token = auth.getToken()
    if (!token) return []
    try {
      const res = await auth.getApi().get('/api/leaderboard/trainer', {
        params: { scenario, period, difficulty, duration_seconds: durationSeconds, limit: 50 },
      })
      return Array.isArray(res.data?.leaderboard) ? res.data.leaderboard : []
    } catch (err: any) {
      log.warn('[Trainer] Failed to fetch leaderboard:', err?.message)
      return []
    }
  })

  // ── Deadlock replays ──────────────────────────────────────────────────────

  ipcMain.handle('deadlock:list-replays', async () => {
    const { resolveDeadlockReplayDirs } = await import('../deadlock-paths')
    const dirs = await resolveDeadlockReplayDirs()
    const seen = new Set<string>()
    const files: Array<{ name: string; path: string; sizeBytes: number; modifiedAt: number }> = []

    for (const dir of dirs) {
      const listed = listRecentDemosInDir(dir, 20)
      for (const f of listed.files) {
        if (seen.has(f.path)) continue
        seen.add(f.path)
        files.push(f)
      }
    }

    files.sort((a, b) => b.modifiedAt - a.modifiedAt)
    const primaryDir = dirs.find((d) => fs.existsSync(d)) ?? dirs[0] ?? ''
    return { files: files.slice(0, 20), dir: primaryDir, exists: dirs.some((d) => fs.existsSync(d)) }
  })

  ipcMain.handle('deadlock:open-replays-folder', async () => {
    const { resolveDeadlockReplayDirs } = await import('../deadlock-paths')
    const dirs = await resolveDeadlockReplayDirs()
    const dir = dirs.find((d) => fs.existsSync(d)) ?? dirs[0]
    if (dir && fs.existsSync(dir)) {
      return openPathSafe(dir)
    }
    return { ok: false, error: 'Deadlock replays folder not found' }
  })

  ipcMain.handle('deadlock:open-analyze', () => {
    shell.openExternal(`${getFrontendBaseUrl()}/deadlock/analyze`)
    return { ok: true }
  })

  ipcMain.handle('deadlock:open-results', (_event, jobId: string) => {
    shell.openExternal(`${getFrontendBaseUrl()}/deadlock/results/${jobId}`)
    return { ok: true }
  })

  ipcMain.handle('deadlock:open-dashboard', () => {
    shell.openExternal(`${getFrontendBaseUrl()}/deadlock`)
    return { ok: true }
  })

  ipcMain.handle('deadlock:open-connect-steam', () => {
    shell.openExternal(`${getFrontendBaseUrl()}/profile?tab=games`)
    return { ok: true }
  })

  ipcMain.handle('deadlock:get-analyses', async (_event, limit = 10) => {
    return auth.fetchDeadlockAnalyses(limit)
  })

  // Full replay review (souls curve, items, abilities, Mid Boss, lobby, kill events) for the v3
  // desktop view, so players don't have to leave the app. Read-only GET of the user's own analysis.
  ipcMain.handle('deadlock:get-analysis-detail', async (_event, jobId: unknown) => {
    if (typeof jobId !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(jobId)) return { ok: false as const, error: 'invalid_job' }
    if (!auth.getToken()) return { ok: false as const, error: 'not_authenticated' }
    try {
      const res = await auth.getApi().get(`/api/deadlock/demo/${encodeURIComponent(jobId)}`)
      if (res.status === 202) return { ok: false as const, error: 'not_ready', status: res.data?.status ?? null }
      return { ok: true as const, detail: res.data ?? null }
    } catch (err: unknown) {
      const status = (err as { status?: number; response?: { status?: number } })?.status
        ?? (err as { response?: { status?: number } })?.response?.status
      return { ok: false as const, error: status === 404 ? 'not_found' : 'fetch_failed' }
    }
  })

  ipcMain.handle('deadlock:search-players', async (_event, query: string) => {
    return auth.searchDeadlockPlayers(query)
  })

  ipcMain.handle('deadlock:lookup-player', async (_event, accountId: number) => {
    return auth.lookupDeadlockPlayer(accountId)
  })

  ipcMain.handle('deadlock:connect-account', async (_event, accountId: number) => {
    return auth.connectDeadlockAccount(accountId)
  })

  ipcMain.handle('deadlock:upload-demo', async (event, demoPath: string) => {
    const sender = event.sender
    const senderWindow = BrowserWindow.fromWebContents(sender)
    const senderUrl = event.senderFrame?.url
    if (!senderWindow || senderWindow.isDestroyed() || !senderUrl || !isTrustedRendererUrl(senderUrl)) {
      return { ok: false as const, error: 'Untrusted upload request' }
    }
    const validated = validateReplayUploadPath(demoPath, await resolveDeadlockReplayDirs())
    if (!validated.ok) {
      return { ok: false as const, error: validated.error }
    }
    try {
      const user = auth.getUser()
      const steamId = user?.deadlock_account_id != null
        ? String(BigInt(user.deadlock_account_id) + BigInt('76561197960265728'))
        : null
      const uploader = new SourceReplayUploader(auth)
      const { jobId } = await uploader.upload({
        game: 'deadlock',
        demoPath: validated.path,
        steamId,
        onProgress: (pct) => {
          try { sender.send('deadlock:upload-progress', { demoPath: validated.path, pct }) } catch { /* ignore */ }
        },
      })
      return { ok: true as const, jobId }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      log.warn('[Deadlock] upload-demo failed:', msg)
      return { ok: false as const, error: msg }
    }
  })

  ipcMain.handle('deadlock:get-detection-status', () => getDeadlockDetectionStatus())

  ipcMain.handle('deadlock:ensure-condebug', async () => ensureDeadlockSteamLaunchOptions())

  ipcMain.handle('deadlock:get-stats', async (_event, opts?: { fresh?: boolean }) => {
    if (!auth.getToken()) {
      return { stats: null, linked: false, error: 'not_authenticated' as const }
    }
    try {
      // Refresh cached user so link state matches web (user may have connected on upforge.gg).
      await auth.fetchUser().catch(() => null)
      const res = await auth.getApi().get('/api/deadlock/stats', {
        params: opts?.fresh ? { fresh: 1 } : undefined,
      })
      return { stats: res.data ?? null, linked: true, error: null }
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 404) {
        return { stats: null, linked: false, error: null }
      }
      log.warn('[Deadlock] get-stats failed:', (err as Error)?.message)
      const linked = !!auth.getUser()?.deadlock_account_id
      return { stats: null, linked, error: 'fetch_failed' as const }
    }
  })

  // ── CS2 ───────────────────────────────────────────────────────────────────

  ipcMain.handle('cs2:detect-demo-dir', async () => {
    const { getCs2CsgoRoot, getCs2PreferredOpenFolder } = await import('../cs2-demo-dirs')
    const custom = settingsManager.get().cs2DemoDir
    const root = await getCs2CsgoRoot(custom)
    const dir = await getCs2PreferredOpenFolder(custom)
    return { dir, root }
  })

  ipcMain.handle('cs2:list-demos', async () => {
    const { listRecentCS2Demos } = await import('../cs2-demo-finder')
    const demoDir = settingsManager.get().cs2DemoDir
    return listRecentCS2Demos(demoDir)
  })

  ipcMain.handle('cs2:open-demos-folder', async () => {
    const { getCs2PreferredOpenFolder } = await import('../cs2-demo-dirs')
    const custom = settingsManager.get().cs2DemoDir
    const dir = await getCs2PreferredOpenFolder(custom)
    if (dir && fs.existsSync(dir)) {
      return openPathSafe(dir)
    }
    return { ok: false, error: 'CS2 demo folder not found' }
  })

  ipcMain.handle('cs2:open-analyze', () => {
    shell.openExternal(`${getFrontendBaseUrl()}/cs2/analyze`)
    return { ok: true }
  })

  ipcMain.handle('cs2:open-dashboard', () => {
    shell.openExternal(`${getFrontendBaseUrl()}/cs2`)
    return { ok: true }
  })

  ipcMain.handle('cs2:open-connect-faceit', () => {
    shell.openExternal(`${getFrontendBaseUrl()}/profile?tab=games`)
    return { ok: true }
  })

  ipcMain.handle('cs2:connect-faceit', async (_event, nickname: string) => {
    return auth.connectCs2Faceit(nickname)
  })

  // Round 7 (CS2): one analysed demo for the in-app result view. Read-only.
  ipcMain.handle('cs2:get-analysis-detail', async (_event, jobId: unknown) => {
    if (typeof jobId !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(jobId)) return { ok: false as const, error: 'invalid_job' }
    if (!auth.getToken()) return { ok: false as const, error: 'not_authenticated' }
    try {
      const res = await auth.getApi().get(`/api/cs2/analyses/${encodeURIComponent(jobId)}`)
      return { ok: true as const, analysis: res.data?.analysis ?? null, source: res.data?.source ?? null }
    } catch (err: unknown) {
      const status = (err as { status?: number; response?: { status?: number } })?.status
        ?? (err as { response?: { status?: number } })?.response?.status
      return { ok: false as const, error: status === 404 ? 'not_found' : 'fetch_failed' }
    }
  })

  ipcMain.handle('cs2:get-analyses', async (_event, limit = 10) => {
    return auth.fetchCs2Analyses(limit)
  })

  ipcMain.handle('cs2:get-profile', async () => {
    return auth.fetchCs2Profile()
  })

  ipcMain.handle('cs2:sync-identity', async (_event, steamDisplayName: string) => {
    await auth.syncCs2Identity(steamDisplayName)
    return { ok: true }
  })

  ipcMain.handle('cs2:get-faceit-connection', async () => {
    try {
      const api = auth.getApi()
      if (!api) return { connected: false }
      const res = await api.get('/api/cs2/faceit/connection')
      const user = auth.getUser()
      const hasAutoSync = !!user?.is_admin
        || user?.tier === 'admin'
        || user?.tier === 'pro'
        || user?.cs2_tier === 'cs2_pro'
      return {
        connected: !!res.data?.connected,
        nickname: res.data?.nickname ?? undefined,
        elo: res.data?.elo ?? null,
        level: res.data?.level ?? null,
        synced_at: res.data?.synced_at ?? null,
        has_auto_sync: hasAutoSync,
      }
    } catch (err: unknown) {
      log.warn('[CS2] get-faceit-connection failed:', (err as Error)?.message)
      throw err
    }
  })

  // ── League of Legends ─────────────────────────────────────────────────────

  ipcMain.handle('lol:get-analyses', async (_event, limit = 10) => {
    return auth.fetchLolAnalyses(limit)
  })

  ipcMain.handle('lol:get-recent-matches', async () => {
    return auth.fetchLolRecentMatches()
  })

  ipcMain.handle('lol:get-recent-matches-result', async () => auth.fetchLolRecentMatchesResult())

  ipcMain.handle('lol:get-rank', () => auth.fetchLolRank())
  // League accounts (main + alts). Changes come only from the app's own windows.
  ipcMain.handle('lol:list-accounts', () => auth.listLolAccounts())
  ipcMain.handle('lol:add-account', (event, input: { riot_name: string; riot_tag: string; platform: string }) => {
    if (!event.senderFrame || !isTrustedRendererUrl(event.senderFrame.url)) return { ok: false, error: 'Untrusted request' }
    return auth.addLolAccount(input)
  })
  ipcMain.handle('lol:set-main-account', (event, id: number) => {
    if (!event.senderFrame || !isTrustedRendererUrl(event.senderFrame.url)) return { ok: false, error: 'Untrusted request' }
    return auth.setMainLolAccount(Number(id))
  })
  ipcMain.handle('lol:remove-account', (event, id: number) => {
    if (!event.senderFrame || !isTrustedRendererUrl(event.senderFrame.url)) return { ok: false, error: 'Untrusted request' }
    return auth.removeLolAccount(Number(id))
  })
  ipcMain.handle('lol:get-focus', () => auth.fetchLolFocus())
  ipcMain.handle('lol:get-analysis', (_event, id: number) => auth.fetchLolAnalysis(Number(id)))
  ipcMain.handle('lol:analyze-match', (event, matchId: string) => {
    // Spends an analysis: only the app's own windows may ask.
    if (!event.senderFrame || !isTrustedRendererUrl(event.senderFrame.url)) return { ok: false, error: 'Untrusted request' }
    return auth.analyzeLolMatch(String(matchId))
  })
  ipcMain.handle('lol:open-analyze', () => {
    shell.openExternal(`${getFrontendBaseUrl()}/lol/analyze`)
    return { ok: true }
  })

  ipcMain.handle('lol:open-history', () => {
    shell.openExternal(`${getFrontendBaseUrl()}/lol/history`)
    return { ok: true }
  })

  ipcMain.handle('lol:open-results', (_event, analysisId: number | string) => {
    // Desktop LoL coaching rows live in analysis_logs, not lol_analyses.
    shell.openExternal(`${getFrontendBaseUrl()}/lol/results/${analysisId}`)
    return { ok: true }
  })

  ipcMain.handle('lol:open-connect-riot', () => {
    shell.openExternal(`${getFrontendBaseUrl()}/profile?tab=games`)
    return { ok: true }
  })

  // ── ForgeRank ─────────────────────────────────────────────────────────────

  ipcMain.handle('forge-rank:prestige', async () => {
    try {
      const api = auth.getApi()
      if (!api) return { success: false }
      const res = await api.post('/api/forge-rank/prestige')
      return res.data
    } catch {
      return { success: false }
    }
  })
}
