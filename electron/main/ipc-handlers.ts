import { IpcMain, BrowserWindow, app, dialog, shell } from 'electron'
import fs from 'fs'
import https from 'https'
import http from 'http'
import path from 'path'
import { is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import log from 'electron-log'
import { AuthManager } from './auth-manager'
import { Recorder } from './recorder'
import { GameDetector } from './game-detector'
import { SettingsManager } from './settings-manager'
import { UploadManager } from './upload-manager'
import { ClipStore, ClipRecord } from './clip-store'
import { ClipExtractor } from './clip-extractor'
import { HotkeyManager } from './hotkey-manager'
import { toggleOverlay, isOverlayVisible, setOverlayInteractive } from './overlay-window'

// Track all active polling timers so they can be cancelled on logout / app quit
const _activePollingTimers = new Set<ReturnType<typeof setTimeout>>()

/** Thrown by _apiPost when the server returns 402 (payment required / limit reached) */
class UpgradeRequiredError extends Error {
  readonly errorCode: string
  readonly upgradeUrl: string
  constructor(message: string, errorCode: string, upgradeUrl = 'https://upforge.gg/pricing') {
    super(message)
    this.name = 'UpgradeRequiredError'
    this.errorCode = errorCode
    this.upgradeUrl = upgradeUrl
  }
}

export function setupClipHandlers(
  ipcMain: IpcMain,
  clipStore: ClipStore,
  clipExtractor: ClipExtractor,
  auth: AuthManager,
  hotkeyManager: HotkeyManager
): void {
  const apiBase = process.env['VITE_API_URL'] || 'https://api.upforge.gg'

  ipcMain.handle('clips:get', () => clipStore.getAll())

  ipcMain.handle('clips:get-thumbnail', (_e, { id }: { id: string }) => {
    const clip = clipStore.getById(id)
    if (!clip?.thumbPath || !fs.existsSync(clip.thumbPath)) return null
    try {
      const data = fs.readFileSync(clip.thumbPath)
      return `data:image/jpeg;base64,${data.toString('base64')}`
    } catch {
      return null
    }
  })

  ipcMain.handle('clips:delete', (_e, { id }: { id: string }) => {
    const clip = clipStore.remove(id)
    if (!clip) return { ok: false, error: 'Not found' }
    // Clean up files from disk
    for (const p of [clip.path, clip.thumbPath]) {
      if (p && fs.existsSync(p)) {
        try { fs.unlinkSync(p) } catch { /* ignore */ }
      }
    }
    return { ok: true }
  })

  ipcMain.handle('clips:update-title', (_e, { id, title }: { id: string; title: string }) => {
    clipStore.update(id, { title })
    return { ok: true }
  })

  ipcMain.handle('clips:open-folder', () => {
    shell.openPath(ClipExtractor.clipsDir())
  })

  ipcMain.handle('clips:get-hotkeys', () => hotkeyManager.getBindings())

  ipcMain.handle('clips:get-hotkey-status', () => ({
    saveClipRegistered: hotkeyManager.isRegistered('save-clip'),
    toggleOverlayRegistered: hotkeyManager.isRegistered('toggle-overlay'),
  }))

  ipcMain.handle('clips:set-hotkey', (_e, { action, accelerator }: { action: string; accelerator: string }) => {
    const ok = hotkeyManager.update(action as 'save-clip' | 'toggle-overlay', accelerator)
    return { ok }
  })

  ipcMain.handle('clips:upload', async (_e, { id }: { id: string }) => {
    const clip = clipStore.getById(id)
    if (!clip) return { ok: false, error: 'Clip not found' }
    if (!fs.existsSync(clip.path)) return { ok: false, error: 'Clip file missing' }

    const token = auth.getToken()
    if (!token) return { ok: false, error: 'Not authenticated' }

    clipStore.update(id, { uploadStatus: 'uploading' })

    try {
      const fileData = fs.readFileSync(clip.path)
      const boundary = `UpForgeBoundary${Date.now()}`
      const fileName = path.basename(clip.path)

      // Build multipart/form-data body
      const parts: Buffer[] = []
      const addField = (name: string, value: string) => {
        parts.push(Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
        ))
      }
      addField('trigger', clip.trigger)
      if (clip.map) addField('map', clip.map)
      if (clip.agent) addField('agent', clip.agent)
      addField('duration_seconds', String(clip.durationSeconds))
      if (clip.round != null) addField('round', String(clip.round))
      if (clip.analysisJobId) addField('analysis_id', clip.analysisJobId)

      parts.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="clip"; filename="${fileName}"\r\nContent-Type: video/mp4\r\n\r\n`
      ))
      parts.push(fileData)
      parts.push(Buffer.from(`\r\n--${boundary}--\r\n`))

      const body = Buffer.concat(parts)
      const url = new URL(`${apiBase}/api/clips`)
      const proto = url.protocol === 'https:' ? https : http

      const apiClipId = await new Promise<number>((resolve, reject) => {
        const req = proto.request({
          method: 'POST',
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname,
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Content-Length': body.length,
            'Accept': 'application/json',
          },
        }, (res) => {
          let data = ''
          res.on('data', (c: Buffer) => { data += c.toString() })
          res.on('end', () => {
            try {
              const json = JSON.parse(data)
              if (res.statusCode === 402) reject(new UpgradeRequiredError(
                json.message || 'Upgrade required',
                json.error || 'upgrade_required',
                json.upgrade_url || 'https://upforge.gg/pricing'
              ))
              else if ((res.statusCode ?? 0) >= 400) reject(new Error(json.message || `Upload failed (${res.statusCode})`))
              else resolve(json.id ?? json.clip?.id)
            } catch {
              reject(new Error(`Invalid server response (HTTP ${res.statusCode})`))
            }
          })
        })
        req.on('error', reject)
        req.setTimeout(120_000, () => req.destroy(new Error('Upload timed out')))
        req.write(body)
        req.end()
      })

      clipStore.update(id, { uploadStatus: 'uploaded', apiClipId })
      return { ok: true, apiClipId }
    } catch (err) {
      if (err instanceof UpgradeRequiredError) {
        clipStore.update(id, { uploadStatus: 'local' })
        return { ok: false, needsUpgrade: true, message: err.message, upgradeUrl: err.upgradeUrl }
      }
      const msg = err instanceof Error ? err.message : String(err)
      clipStore.update(id, { uploadStatus: 'failed' })
      log.error('[ClipUpload] Failed:', msg)
      return { ok: false, error: msg }
    }
  })

  ipcMain.handle('clips:request-analysis', async (_e, { id }: { id: string }) => {
    const clip = clipStore.getById(id)
    if (!clip) return { ok: false, error: 'Clip not found' }

    const token = auth.getToken()
    if (!token) return { ok: false, error: 'Not authenticated' }

    // Must be uploaded first
    if (!clip.apiClipId) {
      return { ok: false, error: 'Upload the clip before requesting analysis' }
    }

    clipStore.update(id, { analysisStatus: 'queued' })

    try {
      await _apiPost(apiBase, `/api/clips/${clip.apiClipId}/analyse`, '{}', token)
      clipStore.update(id, { analysisStatus: 'queued' })

      // Poll for analysis result (max 3 minutes for short clips)
      _pollClipAnalysis(id, clip.apiClipId, token, clipStore, apiBase)

      return { ok: true }
    } catch (err) {
      if (err instanceof UpgradeRequiredError) {
        clipStore.update(id, { analysisStatus: 'none' })
        return { ok: false, needsUpgrade: true, message: err.message, upgradeUrl: err.upgradeUrl }
      }
      const msg = err instanceof Error ? err.message : String(err)
      clipStore.update(id, { analysisStatus: 'failed' })
      return { ok: false, error: msg }
    }
  })

  ipcMain.handle('clips:share', async (_e, { id }: { id: string }) => {
    const clip = clipStore.getById(id)
    if (!clip?.apiClipId) return { ok: false, error: 'Upload clip first' }

    const token = auth.getToken()
    if (!token) return { ok: false, error: 'Not authenticated' }

    try {
      const res = await _apiPost(apiBase, `/api/clips/${clip.apiClipId}/share`, '{}', token) as Record<string, string>
      const shareToken = res.share_token
      const shareUrl = res.share_url
      if (shareToken) clipStore.update(id, { shareToken })
      return { ok: true, shareUrl, shareToken }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('clips:publish', async (_e, { id, caption }: { id: string; caption?: string }) => {
    const clip = clipStore.getById(id)
    if (!clip?.apiClipId) return { ok: false, error: 'Upload clip first' }

    const token = auth.getToken()
    if (!token) return { ok: false, error: 'Not authenticated' }

    try {
      await _apiPost(apiBase, `/api/clips/${clip.apiClipId}/publish`,
        JSON.stringify({ caption: caption ?? null }), token)
      clipStore.update(id, { published: true })
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('overlay:toggle', () => {
    toggleOverlay()
    return { visible: isOverlayVisible() }
  })

  // Renderer requests mouse interactivity on the overlay (for clip button hover)
  ipcMain.on('overlay:set-interactive', (_e, interactive: boolean) => {
    setOverlayInteractive(interactive)
  })
}

/** POST JSON to an API endpoint with Bearer auth. */
function _apiPost(base: string, pathname: string, body: string, token: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${base}${pathname}`)
    const proto = url.protocol === 'https:' ? https : http
    const req = proto.request({
      method: 'POST',
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    }, (res) => {
      let data = ''
      res.on('data', (c: Buffer) => { data += c.toString() })
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          if (res.statusCode === 402) throw new UpgradeRequiredError(
            json.message || 'Upgrade required',
            json.error || 'upgrade_required',
            json.upgrade_url || 'https://upforge.gg/pricing'
          )
          if ((res.statusCode ?? 0) >= 400) reject(new Error(json.message || `Request failed (${res.statusCode})`))
          else resolve(json)
        } catch {
          reject(new Error(`Invalid response (HTTP ${res.statusCode})`))
        }
      })
    })
    req.on('error', reject)
    req.setTimeout(30_000, () => req.destroy(new Error('Request timed out')))
    req.write(body)
    req.end()
  })
}

/** Poll the API for clip analysis completion, updating the local store when done. */
function _pollClipAnalysis(
  localClipId: string,
  apiClipId: number,
  token: string,
  clipStore: ClipStore,
  apiBase: string,
  attempt = 0
): void {
  const delay = Math.min(5000 * Math.pow(1.4, attempt), 30_000)
  const timer = setTimeout(async () => {
    _activePollingTimers.delete(timer)
    if (attempt > 30) {
      clipStore.update(localClipId, { analysisStatus: 'failed' })
      BrowserWindow.getAllWindows().forEach(w => {
        if (!w.isDestroyed()) w.webContents.send('analysis:timeout', localClipId)
      })
      return
    }
    try {
      const url = new URL(`${apiBase}/api/clips/${apiClipId}/analysis`)
      const proto = url.protocol === 'https:' ? https : http
      const result = await new Promise<Record<string, unknown>>((resolve, reject) => {
        proto.get({
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname,
          headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
        }, (res) => {
          let data = ''
          res.on('data', (c: Buffer) => { data += c.toString() })
          res.on('end', () => {
            try { resolve(JSON.parse(data) as Record<string, unknown>) }
            catch { reject(new Error('Invalid JSON')) }
          })
        }).on('error', reject)
      })

      const status = result.status as string
      if (status === 'completed') {
        clipStore.update(localClipId, {
          analysisStatus: 'completed',
          verdict: result.verdict as string ?? null,
          suggestion: result.suggestion as string ?? null,
          coachingTags: (result.coaching_tags as string[]) ?? [],
          overallScore: result.overall_score as number ?? null,
        })
      } else if (status === 'failed') {
        clipStore.update(localClipId, { analysisStatus: 'failed' })
      } else {
        clipStore.update(localClipId, { analysisStatus: 'processing' })
        _pollClipAnalysis(localClipId, apiClipId, token, clipStore, apiBase, attempt + 1)
      }
    } catch {
      _pollClipAnalysis(localClipId, apiClipId, token, clipStore, apiBase, attempt + 1)
    }
  }, delay)
  _activePollingTimers.add(timer)
}

export function setupIpcHandlers(
  ipcMain: IpcMain,
  auth: AuthManager,
  recorder: Recorder,
  gameDetector: GameDetector,
  settingsManager: SettingsManager,
  openPostGameFn?: () => void,
  getFFmpegOk?: () => boolean,
  getWaitingForMatch?: () => boolean,
  getActivityLog?: () => { time: number; message: string }[],
  uploadManager?: UploadManager,
  showClipsFn?: () => void
): void {
  // Auth
  ipcMain.handle('auth:login', async (_e, { email, password }) => {
    log.info('[IPC] auth:login invoked')
    try {
      const result = await auth.login(email, password)
      log.info('[IPC] auth:login result:', result.ok, result.error)
      return result
    } catch (err) {
      log.error('[IPC] auth:login handler threw:', err)
      throw err
    }
  })

  ipcMain.handle('auth:logout', async () => {
    // Stop any active recording before clearing credentials
    if (recorder.isRecording()) {
      try { await recorder.stop() } catch { /* ignore */ }
    }
    // Abort any in-progress S3 upload
    uploadManager?.abort()
    // Cancel any pending clip analysis polling timers
    for (const timer of _activePollingTimers) clearTimeout(timer)
    _activePollingTimers.clear()
    return auth.logout()
  })

  ipcMain.handle('auth:get-user', async () => {
    return auth.getUser()
  })

  ipcMain.handle('auth:load-stored', async () => {
    return auth.loadStoredToken()
  })

  // App state
  ipcMain.handle('app:get-status', () => {
    const settings = settingsManager.get()
    return {
      recording: recorder.isRecording(),
      currentGame: gameDetector.currentGame(),
      waitingForMatch: getWaitingForMatch ? getWaitingForMatch() : false,
      authenticated: auth.isAuthenticated(),
      user: auth.getUser(),
      platform: process.platform,
      isDev: is.dev,
      version: app.getVersion(),
      firstRun: settings.firstRun,
      ffmpegOk: getFFmpegOk ? getFFmpegOk() : true,
      recordedModes: settings.recordedModes
    }
  })

  ipcMain.handle('app:get-activity-log', () => {
    return getActivityLog ? getActivityLog() : []
  })

  ipcMain.handle('app:show-clips', () => {
    showClipsFn?.()
    return { ok: true }
  })

  // Profile — full profile + Valorant stats
  ipcMain.handle('profile:get', async () => {
    return auth.fetchProfile()
  })

  ipcMain.handle('stats:rr-history', async () => {
    return auth.fetchRRHistory()
  })

  // Analyses — recent VOD analyses list
  ipcMain.handle('analyses:get', async (_e, { limit } = {}) => {
    return auth.fetchAnalyses(limit ?? 10)
  })

  // Squad / Team
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

  // Settings
  ipcMain.handle('settings:get', () => {
    return settingsManager.get()
  })

  ipcMain.handle('settings:save', (_e, partial: Record<string, unknown>) => {
    const prev = settingsManager.get()
    const result = settingsManager.save(partial)
    // Sync launchOnStartup with OS login items when it changes
    if ('launchOnStartup' in partial && partial.launchOnStartup !== prev.launchOnStartup) {
      app.setLoginItemSettings({ openAtLogin: !!partial.launchOnStartup })
    }
    return result
  })

  ipcMain.handle('settings:mark-first-run-done', () => {
    return settingsManager.save({ firstRun: false })
  })

  // Storage usage — sum size of all files in the recordings folder
  ipcMain.handle('storage:get-usage', async () => {
    const settings = settingsManager.get()
    const dir = settings.savePath
    let bytes = 0
    let count = 0
    try {
      const entries = await fs.promises.readdir(dir)
      await Promise.all(entries.map(async (entry) => {
        try {
          const stat = await fs.promises.stat(path.join(dir, entry))
          if (stat.isFile()) { bytes += stat.size; count++ }
        } catch { /* ignore unreadable entries */ }
      }))
    } catch { /* dir may not exist yet */ }
    return { bytes, count }
  })

  // Open the recordings folder in Explorer / Finder
  ipcMain.handle('storage:open-folder', () => {
    const settings = settingsManager.get()
    shell.openPath(settings.savePath)
  })

  // Dialog
  ipcMain.handle('dialog:open-directory', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const result = await dialog.showOpenDialog(win!, { properties: ['openDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })

  // Simulate game session — available on non-Windows for testing
  ipcMain.handle('dev:simulate-game', (_e, { game: gameName, durationMs } = {}) => {
    if (process.platform === 'win32' && !is.dev) return { error: 'Simulate not available on Windows production' }
    gameDetector.simulateGame(gameName ?? 'valorant', durationMs ?? 10000)
    return { ok: true }
  })

  // Updater
  ipcMain.handle('updater:check', async () => {
    if (is.dev) return { status: 'dev', message: 'Updates disabled in dev mode' }
    try {
      const result = await autoUpdater.checkForUpdates()
      if (!result) return { status: 'up-to-date', message: 'You\'re on the latest version' }
      const newVersion = result.updateInfo?.version
      if (newVersion && newVersion !== app.getVersion()) {
        return { status: 'available', message: `v${newVersion} is downloading...` }
      }
      return { status: 'up-to-date', message: 'You\'re on the latest version' }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.error('[Updater] checkForUpdates failed:', msg)
      // Provide human-friendly message for common failure modes
      if (msg.includes('404') || msg.includes('not found')) {
        return { status: 'error', message: 'No update metadata found — release may still be building' }
      }
      if (msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED') || msg.includes('network')) {
        return { status: 'error', message: 'No internet connection' }
      }
      return { status: 'error', message: `Update check failed: ${msg}` }
    }
  })

  // Manual recording stop — lets the user stop a session from the UI
  ipcMain.handle('recorder:stop', async () => {
    if (!recorder.isRecording()) return { ok: false, reason: 'not_recording' }
    try {
      await recorder.stop()
      return { ok: true }
    } catch (err) {
      log.error('[IPC] recorder:stop error:', err)
      return { ok: false, reason: String(err) }
    }
  })

  // Window controls (for frameless window)
  ipcMain.handle('window:minimize', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    win?.minimize()
  })

  ipcMain.handle('window:close', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    win?.hide()
  })

  ipcMain.handle('window:open-post-game', () => {
    if (openPostGameFn) openPostGameFn()
  })
}
