import { IpcMain, BrowserWindow, app, dialog, shell, desktopCapturer } from 'electron'
import fs from 'fs'
import https from 'https'
import http from 'http'
import path from 'path'
import { is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import log from 'electron-log'
import { getUpdateState, installUpdate } from './updater'
import { AuthManager } from './auth-manager'
import { DesktopRecorder } from './desktop-recorder'
import { OBSRecorder } from './obs-recorder'
import { GameDetector } from './game-detector'
import { SettingsManager } from './settings-manager'
import { UploadManager } from './upload-manager'
import { ClipStore, ClipRecord } from './clip-store'
import { ClipExtractor } from './clip-extractor'
import { HotkeyManager } from './hotkey-manager'
import { toggleOverlay, isOverlayVisible, setOverlayInteractive, sendOverlayData, showOverlay } from './overlay-window'
import { PerformanceManager } from './performance-manager'
import { UpgradeRequiredError } from './errors'
import { TrainerBridge, type DrillConfig } from './trainer-bridge'
import type { AppSettings } from './settings-manager'

// Track all active polling timers so they can be cancelled on logout / app quit
const _activePollingTimers = new Set<ReturnType<typeof setTimeout>>()

/** Cancel all in-flight clip analysis polling timers. Called on logout and app quit. */
export function cancelAllPollingTimers(): void {
  for (const timer of _activePollingTimers) clearTimeout(timer)
  _activePollingTimers.clear()
}

// Per-clip in-flight lock — prevents concurrent trim/upload/delete on the same file.
// A clip ID in this set means an operation is already running against that file.
const _clipInFlight = new Set<string>()

// Source ID the renderer intends to capture — set just before calling getUserMedia so
// the setDisplayMediaRequestHandler in index.ts can return the correct source (Electron 20+).
let _pendingCaptureSourceId: string | null = null
export function setPendingCaptureSourceId(id: string) { _pendingCaptureSourceId = id }
export function consumePendingCaptureSourceId(): string | null {
  const id = _pendingCaptureSourceId
  _pendingCaptureSourceId = null
  return id
}

/** Valorant colour palette — indices match CrosshairConfig.gd VALORANT_COLORS */
const CROSSHAIR_PALETTE: [number, number, number][] = [
  [1.0,  1.0,  1.0 ], // 0 white
  [0.0,  1.0,  0.42], // 1 green
  [1.0,  0.85, 0.0 ], // 2 yellow
  [0.0,  0.87, 1.0 ], // 3 cyan
  [1.0,  0.47, 0.87], // 4 pink
  [1.0,  0.27, 0.33], // 5 red
]

/** Convert Electron CrosshairSettings into the Godot dict format. */
function crosshairSettingsToGodot(
  cs: AppSettings['crosshairSettings']
): DrillConfig['crosshair_settings'] {
  let color: [number, number, number]
  if (cs.colorIndex >= 0 && cs.colorIndex < CROSSHAIR_PALETTE.length) {
    color = CROSSHAIR_PALETTE[cs.colorIndex]
  } else {
    // Parse custom hex color to normalized [r, g, b]
    const hex = cs.customColor.replace('#', '').padEnd(6, '0')
    color = [
      parseInt(hex.slice(0, 2), 16) / 255,
      parseInt(hex.slice(2, 4), 16) / 255,
      parseInt(hex.slice(4, 6), 16) / 255,
    ]
  }
  return {
    color,
    shadow_show:      cs.shadowShow,
    dot_show:         cs.dotShow,
    dot_radius:       cs.dotRadius,
    dot_opacity:      cs.dotOpacity,
    inner_show:       cs.innerShow,
    inner_thickness:  cs.innerThickness,
    inner_length:     cs.innerLength,
    inner_offset:     cs.innerOffset,
    inner_opacity:    cs.innerOpacity,
    outer_show:       cs.outerShow,
    outer_thickness:  cs.outerThickness,
    outer_length:     cs.outerLength,
    outer_offset:     cs.outerOffset,
    outer_opacity:    cs.outerOpacity,
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
    if (_clipInFlight.has(id)) return { ok: false, error: 'Cannot delete while an operation is in progress' }
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
    screenshotRegistered: hotkeyManager.isRegistered('take-screenshot'),
  }))

  ipcMain.handle('clips:set-hotkey', (_e, { action, accelerator }: { action: string; accelerator: string }) => {
    const ok = hotkeyManager.update(action as 'save-clip' | 'toggle-overlay' | 'take-screenshot', accelerator)
    return { ok }
  })

  ipcMain.handle('clips:upload', async (_e, { id }: { id: string }) => {
    const clip = clipStore.getById(id)
    if (!clip) return { ok: false, error: 'Clip not found' }
    if (!fs.existsSync(clip.path)) return { ok: false, error: 'Clip file missing' }
    if (_clipInFlight.has(id)) return { ok: false, error: 'Upload or trim already in progress for this clip' }

    const token = auth.getToken()
    if (!token) return { ok: false, error: 'Not authenticated' }

    _clipInFlight.add(id)
    clipStore.update(id, { uploadStatus: 'uploading' })

    try {
      // Step 1: Get a presigned S3 URL (tiny JSON request — no nginx body limit)
      const presignPayload = JSON.stringify({
        trigger:          clip.trigger,
        map:              clip.map ?? undefined,
        agent:            clip.agent ?? undefined,
        duration_seconds: clip.durationSeconds,
        round:            clip.round ?? undefined,
        analysis_id:      clip.analysisJobId ?? undefined,
      })
      const { upload_url: uploadUrl, clip_uuid: clipUuid } = await _apiPost(
        apiBase, '/api/clips/presign', presignPayload, token
      ) as { upload_url: string; clip_uuid: string }

      // Step 2: Stream the file directly to S3 (bypasses nginx — no body size limit)
      const fileSize = fs.statSync(clip.path).size
      const s3Url = new URL(uploadUrl)
      const s3Proto = s3Url.protocol === 'https:' ? https : http
      await new Promise<void>((resolve, reject) => {
        const req = s3Proto.request({
          method:   'PUT',
          hostname: s3Url.hostname,
          port:     s3Url.port || (s3Url.protocol === 'https:' ? 443 : 80),
          path:     s3Url.pathname + s3Url.search,
          headers: {
            'Content-Type':   'video/mp4',
            'Content-Length': fileSize,
          },
        }, (res) => {
          res.resume()
          res.on('end', () => {
            if ((res.statusCode ?? 0) >= 400) reject(new Error(`S3 upload failed (${res.statusCode})`))
            else resolve()
          })
        })
        req.on('error', reject)
        req.setTimeout(300_000, () => req.destroy(new Error('S3 upload timed out')))
        fs.createReadStream(clip.path).pipe(req)
      })

      // Step 3: Tell the API the upload is complete → creates the Clip record
      const completePayload = JSON.stringify({
        clip_uuid:        clipUuid,
        trigger:          clip.trigger,
        map:              clip.map ?? undefined,
        agent:            clip.agent ?? undefined,
        duration_seconds: clip.durationSeconds,
        round:            clip.round ?? undefined,
        analysis_id:      clip.analysisJobId ?? undefined,
      })
      const { id: apiClipId } = await _apiPost(
        apiBase, '/api/clips/complete', completePayload, token
      ) as { id: number }

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
    } finally {
      _clipInFlight.delete(id)
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

  ipcMain.handle('clips:trim', async (_e, { id, startSec, endSec }: { id: string; startSec: number; endSec: number }) => {
    const clip = clipStore.getById(id)
    if (!clip) return { ok: false, error: 'Clip not found' }
    if (!fs.existsSync(clip.path)) return { ok: false, error: 'Clip file not found on disk' }
    if (_clipInFlight.has(id)) return { ok: false, error: 'Upload or trim already in progress for this clip' }

    _clipInFlight.add(id)
    const trimmedPath = clip.path.replace(/\.mp4$/, '_trimmed.mp4')
    try {
      await clipExtractor.trim({ sourcePath: clip.path, startSec, endSec, outputPath: trimmedPath })
      // Swap trimmed file in atomically: rename original to a backup first so we can
      // restore it if the final rename fails. Never delete the original before the
      // trimmed file is safely in place.
      const backupPath = clip.path + '.bak'
      try {
        fs.renameSync(clip.path, backupPath)
        try {
          fs.renameSync(trimmedPath, clip.path)
          try { fs.unlinkSync(backupPath) } catch { /* backup cleanup — non-fatal */ }
        } catch (renameErr) {
          // Failed to put trimmed file in place — restore original from backup
          try { fs.renameSync(backupPath, clip.path) } catch { /* best-effort restore */ }
          throw renameErr
        }
      } catch (backupErr) {
        // Could not rename original to backup (e.g. cross-device) — fall back to delete-then-rename
        try { fs.unlinkSync(clip.path) } catch { /* ignore */ }
        fs.renameSync(trimmedPath, clip.path)
      }
      const dur = endSec - startSec
      clipStore.update(id, { durationSeconds: dur, uploadStatus: 'local' })
      return { ok: true }
    } catch (err) {
      try { if (fs.existsSync(trimmedPath)) fs.unlinkSync(trimmedPath) } catch { /* ignore */ }
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    } finally {
      _clipInFlight.delete(id)
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

  // Scan running processes for known apps that steal global hotkeys
  ipcMain.handle('debug:find-hotkey-conflict', async () => {
    if (process.platform !== 'win32') {
      return { supported: false, found: [] }
    }
    // Known process names that commonly register global F-key hotkeys
    const KNOWN_CULPRITS: Array<{ exe: string; name: string; fix: string }> = [
      { exe: 'Discord.exe',            name: 'Discord',               fix: 'Settings → Keybinds — remove any F9 binding' },
      { exe: 'DiscordPTB.exe',         name: 'Discord PTB',           fix: 'Settings → Keybinds — remove any F9 binding' },
      { exe: 'DiscordCanary.exe',      name: 'Discord Canary',        fix: 'Settings → Keybinds — remove any F9 binding' },
      { exe: 'obs64.exe',              name: 'OBS Studio',            fix: 'Settings → Hotkeys — clear any F9 hotkey' },
      { exe: 'obs32.exe',              name: 'OBS Studio (32-bit)',   fix: 'Settings → Hotkeys — clear any F9 hotkey' },
      { exe: 'NVIDIA Share.exe',       name: 'NVIDIA GeForce Experience (Share/ShadowPlay)', fix: 'GeForce Experience → Settings → Overlay — disable or rebind hotkeys' },
      { exe: 'nvcontainer.exe',        name: 'NVIDIA Container',      fix: 'GeForce Experience → Settings — disable in-game overlay' },
      { exe: 'LGHUB.exe',              name: 'Logitech G HUB',        fix: 'G HUB → Assignments — remove any F9 macro binding' },
      { exe: 'LCore.exe',              name: 'Logitech Gaming Software', fix: 'LGS → Assignments — remove any F9 macro binding' },
      { exe: 'RzSynapse.exe',          name: 'Razer Synapse',         fix: 'Synapse → Keyboard macros — remove any F9 binding' },
      { exe: 'Razer Synapse 3.exe',    name: 'Razer Synapse 3',       fix: 'Synapse → Keyboard macros — remove any F9 binding' },
      { exe: 'SteelSeriesGG.exe',      name: 'SteelSeries GG',        fix: 'SteelSeries GG → Engine — remove any F9 macro' },
      { exe: 'iCUE.exe',               name: 'Corsair iCUE',          fix: 'iCUE → Profiles — remove any F9 action' },
      { exe: 'NGENUITY.exe',           name: 'HyperX NGenuity',       fix: 'NGenuity → Macros — remove any F9 binding' },
      { exe: 'StreamDeck.exe',         name: 'Elgato Stream Deck',    fix: 'Stream Deck software — remove any F9 action' },
      { exe: 'AutoHotkey.exe',         name: 'AutoHotkey',            fix: 'Close or edit your AutoHotkey script — check for F9 hotkey' },
      { exe: 'AutoHotkey64.exe',       name: 'AutoHotkey (64-bit)',   fix: 'Close or edit your AutoHotkey script — check for F9 hotkey' },
      { exe: 'XboxGameBarWidgets.exe', name: 'Xbox Game Bar',         fix: 'Windows Settings → Gaming → Xbox Game Bar — disable or rebind' },
      { exe: 'GameBar.exe',            name: 'Xbox Game Bar',         fix: 'Windows Settings → Gaming → Xbox Game Bar — disable or rebind' },
      { exe: 'MSIAfterburner.exe',     name: 'MSI Afterburner',       fix: 'Afterburner → Settings → On-Screen Display — rebind hotkeys' },
      { exe: 'RTSS.exe',               name: 'RivaTuner Statistics Server', fix: 'RTSS → Setup — rebind hotkeys' },
      { exe: 'voicemeeter.exe',        name: 'VoiceMeeter',           fix: 'VoiceMeeter → Menu → System Settings — remove any F9 binding' },
      { exe: 'voicemeeterpro.exe',     name: 'VoiceMeeter Potato',    fix: 'VoiceMeeter → System Settings — remove any F9 binding' },
      { exe: 'EpicGamesLauncher.exe',  name: 'Epic Games Launcher',   fix: 'Epic Settings → In-Game Overlay — disable or rebind' },
      { exe: 'PlayNitroSense.exe',     name: 'NitroSense',            fix: 'NitroSense Settings — rebind or disable hotkeys' },
    ]

    try {
      // Run tasklist and capture output
      const { execSync } = await import('child_process')
      const output = execSync('tasklist /FO CSV /NH', { timeout: 5000, encoding: 'utf8' })
      const runningExes = new Set(
        output.split('\n')
          .map(line => line.trim().replace(/^"/, '').split('"')[0].toLowerCase())
          .filter(Boolean)
      )
      const found = KNOWN_CULPRITS.filter(c => runningExes.has(c.exe.toLowerCase()))
      log.info('[HotkeyDiag] Running processes checked, conflicts found:', found.map(f => f.name))
      return { supported: true, found }
    } catch (err) {
      log.warn('[HotkeyDiag] tasklist failed:', err)
      return { supported: true, found: [], error: 'Could not scan processes' }
    }
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
        let json: Record<string, unknown> = {}
        try {
          json = JSON.parse(data)
        } catch {
          reject(new Error(`Invalid response (HTTP ${res.statusCode})`))
          return
        }
        if (res.statusCode === 402) {
          reject(new UpgradeRequiredError(
            (json.message as string) || 'Upgrade required',
            (json.error as string) || 'upgrade_required',
            (json.upgrade_url as string) || 'https://upforge.gg/pricing'
          ))
        } else if ((res.statusCode ?? 0) >= 400) {
          reject(new Error((json.message as string) || `Request failed (${res.statusCode})`))
        } else {
          resolve(json)
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
  recorder: DesktopRecorder,
  gameDetector: GameDetector,
  settingsManager: SettingsManager,
  openPostGameFn?: () => void,
  getFFmpegOk?: () => boolean,
  getWaitingForMatch?: () => boolean,
  getActivityLog?: () => { time: number; message: string }[],
  uploadManager?: UploadManager,
  showClipsFn?: () => void,
  performanceManager?: PerformanceManager,
  obsRecorder?: OBSRecorder,
  trainerBridge?: TrainerBridge
): void {
  // Auth
  ipcMain.handle('auth:login', async (_e, { email, password }) => {
    log.info('[IPC] auth:login invoked')
    try {
      const result = await auth.login(email, password)
      log.info('[IPC] auth:login result:', result.ok, result.error)
      if (result.ok) {
        // Expand and maximize the window now that the user is authenticated
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
    // Stop any active recording before clearing credentials
    if (recorder.isRecording()) {
      try { await recorder.stop() } catch { /* ignore */ }
    }
    // Abort any in-progress S3 upload
    uploadManager?.abort()
    // Cancel any pending clip analysis polling timers
    cancelAllPollingTimers()
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
      recordingStartedAt: recorder.getRecordingStartedAt(),
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

  // Analyses — fetch coaching detail (verdict, improvements, tags) for a single analysis
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

  // Analyses — fetch full match timeline for a past analysis
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

  // Immediately sync accurate presence from main process state (called by squad view on mount/heartbeat)
  ipcMain.handle('squad:sync-presence', async () => {
    await auth.sendPresence(recorder.isRecording(), gameDetector.currentGame())
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
    // Broadcast settings change to all renderer windows
    BrowserWindow.getAllWindows().forEach(w => {
      if (!w.isDestroyed()) w.webContents.send('settings:changed', result)
    })
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

  ipcMain.handle('updater:getState', () => getUpdateState())

  ipcMain.handle('updater:install', () => {
    if (is.dev) return
    installUpdate()
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

  // Performance boost
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

  ipcMain.handle('screenshots:save', (_e, { dataUrl }: { dataUrl: string }) => {
    try {
      const screenshotsDir = path.join(app.getPath('userData'), 'screenshots')
      if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true })
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
      const filename = `screenshot_${timestamp}.png`
      const filepath = path.join(screenshotsDir, filename)
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, '')
      fs.writeFileSync(filepath, Buffer.from(base64, 'base64'))
      log.info('[Screenshots] Saved:', filepath)
      return { ok: true, filename, path: filepath }
    } catch (err) {
      log.error('[Screenshots] Failed to save:', err)
      return { ok: false, error: String(err) }
    }
  })

  // desktopCapturer is only available in the main process (removed from preload in Electron 20+)
  ipcMain.handle('desktop-capturer:get-sources', async (_e, types: Array<'screen' | 'window'>) => {
    const sources = await desktopCapturer.getSources({ types })
    return sources.map(s => ({ id: s.id, name: s.name }))
  })

  // Renderer tells us which source ID it intends to capture before calling getUserMedia.
  // This is read back by the setDisplayMediaRequestHandler in index.ts (required Electron 20+).
  ipcMain.handle('desktop-capturer:set-source', (_e, sourceId: string) => {
    setPendingCaptureSourceId(sourceId)
  })

  ipcMain.handle('screenshots:capture-screen', async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 3840, height: 2160 },
      })
      if (!sources.length) return null
      return sources[0].thumbnail.toDataURL()
    } catch { return null }
  })

  // OBS WebSocket handlers (Pro tier)
  ipcMain.handle('obs:connect', async () => {
    if (!obsRecorder) return { ok: false, error: 'OBS recorder not available' }
    return obsRecorder.connect()
  })

  ipcMain.handle('obs:disconnect', async () => {
    if (!obsRecorder) return
    return obsRecorder.disconnect()
  })

  ipcMain.handle('obs:get-status', async () => {
    if (!obsRecorder) return { connected: false, recording: false, replayBufferActive: false, outputPath: null, lastError: null, obsVersion: null }
    return obsRecorder.getOBSStatus()
  })

  ipcMain.handle('obs:save-replay-clip', async () => {
    if (!obsRecorder) return { path: null }
    const path = await obsRecorder.saveReplayClip()
    return { path }
  })

  // ── Aim Trainer ────────────────────────────────────────────────────────────

  // Forward completed session results to the overlay AND sync to the API
  const apiBase = process.env['VITE_API_URL'] || 'https://api.upforge.gg'
  trainerBridge?.setResultCallback((result) => {
    // Send result to overlay window (only renders if overlay is already open)
    sendOverlayData('overlay:trainer-result', result)

    // Fire-and-forget: persist session to Laravel API
    const token = auth.getToken()
    if (token) {
      _apiPost(apiBase, '/api/training/sessions', JSON.stringify(result), token)
        .then(() => log.info('[Trainer] Session synced to API'))
        .catch((err) => log.warn('[Trainer] Failed to sync session to API:', err?.message))
    }
  })

  ipcMain.handle('trainer:launch', async (_e, config: DrillConfig) => {
    if (!trainerBridge) return { ok: false, error: 'Trainer not available' }
    try {
      const s = settingsManager.get()
      const ms = s.trainerMouse
      const cs = s.crosshairSettings
      const enrichedConfig: DrillConfig = {
        ...config,
        mouse_settings: {
          dpi: ms.dpi,
          game: ms.game,
          sensitivity: ms.sensitivity,
          fov: ms.fov,
        },
        crosshair_settings: crosshairSettingsToGodot(cs),
      }
      await trainerBridge.launch(enrichedConfig)
      sendOverlayData('overlay:trainer-started', {
        scenario: config.scenario,
        difficulty: config.difficulty,
        duration_seconds: config.duration_seconds,
      })
      return { ok: true }
    } catch (err: any) {
      log.error('[IPC] trainer:launch error:', err)
      return { ok: false, error: err?.message ?? 'Failed to launch trainer' }
    }
  })

  ipcMain.handle('trainer:kill', () => {
    trainerBridge?.kill()
    return { ok: true }
  })

  ipcMain.handle('trainer:get-history', async () => {
    const token = auth.getToken()
    if (!token) return null
    try {
      const res = await auth.getApi().get('/api/training/sessions?limit=50')
      return res.data ?? null
    } catch (err: any) {
      log.warn('[Trainer] Failed to fetch training history:', err?.message)
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
      // API returns { active: [...], completed: [...] }
      if (data && typeof data === 'object') return (data as Record<string, unknown>).active ?? []
      return []
    } catch (err: any) {
      log.warn('[Trainer] Failed to fetch coaching drills:', err?.message)
      return []
    }
  })

  ipcMain.handle('trainer:get-correlation', async () => {
    const token = auth.getToken()
    if (!token) return []
    try {
      const res = await auth.getApi().get('/api/training/correlation')
      return Array.isArray(res.data) ? res.data : []
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

  // ─── Deadlock demo (.dem) replay helpers ────────────────────────────────────
  ipcMain.handle('deadlock:list-replays', async () => {
    const localAppData = process.env.LOCALAPPDATA || path.join(app.getPath('home'), 'AppData', 'Local')
    const replayDir = path.join(localAppData, 'Deadlock', 'game', 'deadlock', 'replays')
    try {
      if (!fs.existsSync(replayDir)) return { files: [], dir: replayDir, exists: false }
      const entries = fs.readdirSync(replayDir)
      const files = entries
        .filter(f => f.endsWith('.dem'))
        .map(f => {
          const full = path.join(replayDir, f)
          const stat = fs.statSync(full)
          return { name: f, path: full, sizeBytes: stat.size, modifiedAt: stat.mtimeMs }
        })
        .sort((a, b) => b.modifiedAt - a.modifiedAt)
        .slice(0, 20)
      return { files, dir: replayDir, exists: true }
    } catch (err: any) {
      log.warn('[Deadlock] Failed to list replays:', err?.message)
      return { files: [], dir: replayDir, exists: false }
    }
  })

  ipcMain.handle('deadlock:open-replays-folder', async () => {
    const localAppData = process.env.LOCALAPPDATA || path.join(app.getPath('home'), 'AppData', 'Local')
    const replayDir = path.join(localAppData, 'Deadlock', 'game', 'deadlock', 'replays')
    if (fs.existsSync(replayDir)) {
      await shell.openPath(replayDir)
    } else {
      await shell.openPath(path.join(localAppData, 'Deadlock'))
    }
    return { ok: true }
  })

  ipcMain.handle('deadlock:open-analyze', () => {
    shell.openExternal('https://upforge.gg/deadlock/analyze')
    return { ok: true }
  })

  ipcMain.handle('deadlock:open-dashboard', () => {
    shell.openExternal('https://upforge.gg/deadlock')
    return { ok: true }
  })

  // Fetch Deadlock profile stats from API (Steam-linked data)
  ipcMain.handle('deadlock:get-stats', async () => {
    try {
      const api = auth.getApi()
      if (!api) return null
      const res = await api.get('/api/deadlock/profile')
      return res.data?.profile ?? null
    } catch {
      return null
    }
  })

  ipcMain.handle('cs2:detect-demo-dir', async () => {
    const { detectCS2DemoDir } = await import('./cs2-demo-finder')
    const dir = await detectCS2DemoDir()
    return { dir }
  })

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
