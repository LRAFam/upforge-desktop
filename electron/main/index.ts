import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  ipcMain,
  shell,
  screen,
  Notification,
  globalShortcut
} from 'electron'
import { join } from 'path'
import fs from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { setupAutoUpdater } from './updater'
import { GameDetector } from './game-detector'
import { Recorder } from './recorder'
import { RiotLocalApi } from './riot-local-api'
import { UploadManager, savePendingJob, clearPendingJob, readPendingJob } from './upload-manager'
import { AuthManager } from './auth-manager'
import { SettingsManager } from './settings-manager'
import { setupIpcHandlers, setupClipHandlers } from './ipc-handlers'
import { RecordingsStore } from './recordings-store'
import { ClipExtractor } from './clip-extractor'
import { ClipStore } from './clip-store'
import { HotkeyManager } from './hotkey-manager'
import { createOverlayWindow, toggleOverlay, destroyOverlay, sendOverlayData, isOverlayVisible, showOverlay, hideOverlay } from './overlay-window'
import { PerformanceManager } from './performance-manager'
import type { MatchData } from './riot-local-api'
import log from 'electron-log'

// Catch any floating promise rejections in the main process before they
// crash Electron silently. Log them so they show up in support logs.
process.on('unhandledRejection', (reason) => {
  console.error('[Main] Unhandled promise rejection:', reason)
})

let tray: Tray | null = null
let mainWindow: BrowserWindow | null = null
let postGameWindow: BrowserWindow | null = null
let isQuitting = false
let trayRefreshInterval: ReturnType<typeof setInterval> | null = null
let updateTrayMenuFn: (() => void) | null = null
let ffmpegOk = true // updated after preflight; exposed via app:get-status

const gameDetector = new GameDetector()
const recorder = new Recorder()
const clipExtractor = new ClipExtractor()
const clipStore = new ClipStore()
const hotkeyManager = new HotkeyManager()
recorder.onStatusChange = (recording, error) => {
  mainWindow?.webContents.send('recording:status-changed', { recording, error: error ?? null })
  updateTrayMenuFn?.() // keep tray in sync without waiting for the 30s interval
  // If recording stopped unexpectedly due to an error, show a system notification
  // so the user knows even if UpForge is in the background during a game
  if (!recording && error) {
    console.warn('[Main] Recording stopped with error:', error)
    tray?.setToolTip('UpForge — Recording stopped!')
    if (Notification.isSupported()) {
      new Notification({
        title: 'UpForge — Recording Stopped',
        body: 'Recording stopped unexpectedly. Open UpForge to see details.',
        silent: false
      }).show()
    }
    setTimeout(() => tray?.setToolTip('UpForge — Valorant AI Coaching'), 10_000)
  }
}
const riotLocalApi = new RiotLocalApi()
const authManager = new AuthManager()
const performanceManager = new PerformanceManager()
let uploadManager: UploadManager
let settingsManager: SettingsManager
let recordingsStore: RecordingsStore

// Set by setupGameDetection — cancel pending match-wait when game quits from lobby
let cancelMatchWait: (() => void) | null = null
let waitingForMatch = false
// Prevents double-handling when onMatchEnded + game-stopped both fire for same match
let matchHandled = false
// Overlay polling timer — cleared when match ends or game stops
let overlayPollTimer: ReturnType<typeof setInterval> | null = null

// Activity log — recent events shown on dashboard for user visibility
const MAX_LOG_ENTRIES = 30
const activityLog: { time: number; message: string }[] = []

// Hotkey bookmarks — timestamps (ms) relative to recording start pressed during a match
const hotkeyBookmarks: number[] = []
// Recording start time — set when recorder.start() succeeds
let currentRecordingStartTime: number | null = null
// Auto-hide timer for overlay flash feedback (clip bookmarked while overlay is hidden)
let overlayAutoHideTimer: ReturnType<typeof setTimeout> | null = null

function logActivity(message: string): void {
  const entry = { time: Date.now(), message }
  activityLog.push(entry)
  if (activityLog.length > MAX_LOG_ENTRIES) activityLog.shift()
  mainWindow?.webContents.send('app:activity-log', activityLog.slice())
}

/**
 * Detect rounds where the local player was the last alive on their team and won (clutch).
 * Returns the set of round numbers (0-indexed) where a clutch occurred.
 */
function detectClutchRounds(timeline: MatchData): Set<number> {
  const clutchRounds = new Set<number>()
  if (!timeline.matchDetails || !timeline.puuid) return clutchRounds

  const details = timeline.matchDetails
  const players = details.players as Array<Record<string, unknown>> | undefined
  const roundResults = details.roundResults as Array<Record<string, unknown>> | undefined
  const allKills = details.kills as Array<Record<string, unknown>> | undefined

  if (!players || !roundResults || !allKills) return clutchRounds

  const ownPuuid = timeline.puuid

  // Build team map: puuid -> teamId
  const teamMap = new Map<string, string>()
  for (const p of players) {
    if (p.subject && p.teamId) teamMap.set(p.subject as string, p.teamId as string)
  }
  const ownTeam = teamMap.get(ownPuuid)
  if (!ownTeam) return clutchRounds

  const allyPuuids = new Set(
    [...teamMap.entries()].filter(([p, t]) => t === ownTeam && p !== ownPuuid).map(([p]) => p)
  )
  const enemyPuuids = new Set(
    [...teamMap.entries()].filter(([_, t]) => t !== ownTeam).map(([p]) => p)
  )

  // Group all kills (every player) by round
  const allKillsByRound = new Map<number, Array<Record<string, unknown>>>()
  for (const kill of allKills) {
    const r = (kill.round as number) ?? 0
    if (!allKillsByRound.has(r)) allKillsByRound.set(r, [])
    allKillsByRound.get(r)!.push(kill)
  }

  for (const [roundNum, kills] of allKillsByRound.entries()) {
    const sorted = [...kills].sort((a, b) =>
      ((a.timeSinceGameStartMillis as number) ?? 0) - ((b.timeSinceGameStartMillis as number) ?? 0)
    )

    const liveAllies = new Set(allyPuuids)
    const liveEnemies = new Set(enemyPuuids)
    let playerAlive = true
    let clutchDetected = false

    for (const kill of sorted) {
      const victim = kill.victim as string
      if (victim === ownPuuid) { playerAlive = false; break }
      if (liveAllies.has(victim)) liveAllies.delete(victim)
      if (liveEnemies.has(victim)) liveEnemies.delete(victim)

      // Player becomes last alive on their team with enemies remaining
      if (!clutchDetected && liveAllies.size === 0 && liveEnemies.size >= 1) {
        clutchDetected = true
      }
    }

    if (!clutchDetected || !playerAlive) continue

    // Player must have killed at least one enemy after being last alive
    const clutchKills = timeline.playerKills.filter(k => (k.round ?? -1) === roundNum)
    if (clutchKills.length === 0) continue

    // Round must have been won by player's team
    const roundResult = roundResults[roundNum] as Record<string, unknown> | undefined
    if ((roundResult?.winningTeam as string) === ownTeam) {
      clutchRounds.add(roundNum)
    }
  }

  return clutchRounds
}

/**
 * Extract only kill-based clips (3K/4K/ace/clutch) from a match recording.
 * Used by the late-retry path when match details weren't available at match end.
 */
async function extractKillClipsOnly(
  videoPath: string,
  timeline: MatchData,
  analysisJobId: string | null
): Promise<void> {
  if (!fs.existsSync(videoPath)) return
  if (!timeline.playerKills || timeline.playerKills.length === 0) return

  const map = timeline.map ?? null
  const agent = timeline.agent ?? null
  const extractedClipIds: string[] = []

  // Group kills by round
  const killsByRound = new Map<number, typeof timeline.playerKills>()
  for (const kill of timeline.playerKills) {
    const r = kill.round ?? -1
    if (!killsByRound.has(r)) killsByRound.set(r, [])
    killsByRound.get(r)!.push(kill)
  }

  const clutchRounds = detectClutchRounds(timeline)

  const combinedRounds = new Map<number, { kills: typeof timeline.playerKills; trigger: 'ace' | 'multikill'; killCount: number }>()
  for (const [round, kills] of killsByRound.entries()) {
    if (clutchRounds.has(round)) continue
    if (kills.length >= 5) combinedRounds.set(round, { kills, trigger: 'ace', killCount: kills.length })
    else if (kills.length >= 3) combinedRounds.set(round, { kills, trigger: 'multikill', killCount: kills.length })
  }

  // Combined clips (3k / 4k / ace)
  for (const [round, { kills: roundKills, trigger, killCount }] of combinedRounds.entries()) {
    const validKills = roundKills.filter(k => k.videoOffsetMs != null)
    if (validKills.length === 0) continue
    const first = validKills.reduce((a, b) => a.videoOffsetMs! < b.videoOffsetMs! ? a : b)
    const last = validKills.reduce((a, b) => a.videoOffsetMs! > b.videoOffsetMs! ? a : b)
    const startMs = Math.max(0, first.videoOffsetMs! - 5_000)
    const durationMs = Math.min(last.videoOffsetMs! - first.videoOffsetMs! + 12_000, 120_000)
    try {
      const tempRecord = clipStore.add({ path: '', thumbPath: null, trigger, map, agent, durationSeconds: durationMs / 1000, round, killCount, analysisJobId })
      const clipPath = ClipExtractor.clipPath(tempRecord.id)
      const thumbPath = ClipExtractor.thumbPath(tempRecord.id)
      await clipExtractor.extract({ sourcePath: videoPath, startOffsetMs: startMs, durationMs, outputPath: clipPath })
      await clipExtractor.thumbnail({ sourcePath: videoPath, offsetMs: first.videoOffsetMs!, outputPath: thumbPath })
      clipStore.update(tempRecord.id, { path: clipPath, thumbPath })
      extractedClipIds.push(tempRecord.id)
      const label = trigger === 'ace' ? 'Ace' : `${killCount}K`
      logActivity(`${label} clip saved (late extract) — Round ${round + 1} (${map ?? 'unknown'})`)
    } catch (err) {
      log.warn(`[LateClipExtract] ${trigger} clip failed:`, err)
    }
  }

  // Clutch clips
  for (const round of clutchRounds) {
    const clutchKills = timeline.playerKills.filter(k => (k.round ?? -1) === round && k.videoOffsetMs != null)
    if (clutchKills.length === 0) continue
    const first = clutchKills.reduce((a, b) => a.videoOffsetMs! < b.videoOffsetMs! ? a : b)
    const last = clutchKills.reduce((a, b) => a.videoOffsetMs! > b.videoOffsetMs! ? a : b)
    const startMs = Math.max(0, first.videoOffsetMs! - 15_000)
    const durationMs = Math.min(last.videoOffsetMs! - first.videoOffsetMs! + 12_000, 120_000)
    try {
      const tempRecord = clipStore.add({ path: '', thumbPath: null, trigger: 'clutch', map, agent, durationSeconds: durationMs / 1000, round, killCount: clutchKills.length, analysisJobId })
      const clipPath = ClipExtractor.clipPath(tempRecord.id)
      const thumbPath = ClipExtractor.thumbPath(tempRecord.id)
      await clipExtractor.extract({ sourcePath: videoPath, startOffsetMs: startMs, durationMs, outputPath: clipPath })
      await clipExtractor.thumbnail({ sourcePath: videoPath, offsetMs: first.videoOffsetMs!, outputPath: thumbPath })
      clipStore.update(tempRecord.id, { path: clipPath, thumbPath })
      extractedClipIds.push(tempRecord.id)
      logActivity(`Clutch clip saved (late extract) — Round ${round + 1} (${map ?? 'unknown'})`)
    } catch (err) {
      log.warn('[LateClipExtract] Clutch clip failed:', err)
    }
  }

  if (extractedClipIds.length > 0) {
    logActivity(`${extractedClipIds.length} late-extracted clip${extractedClipIds.length === 1 ? '' : 's'} saved`)
    mainWindow?.webContents.send('clips:new', extractedClipIds)
    if (Notification.isSupported()) {
      new Notification({
        title: 'UpForge — Clips Ready',
        body: `${extractedClipIds.length} highlight clip${extractedClipIds.length === 1 ? '' : 's'} saved from your match!`,
        silent: true,
      }).show()
    }
  }
}

/**
 * Extract highlight clips from a completed match recording.
 * Called post-match once the recording file is finalised.
 */
async function extractMatchClips(
  videoPath: string,
  timeline: MatchData | null,
  analysisJobId: string | null
): Promise<void> {
  if (!fs.existsSync(videoPath)) return

  const recordingStart = currentRecordingStartTime ?? 0
  const map = timeline?.map ?? null
  const agent = timeline?.agent ?? null
  const extractedClipIds: string[] = []

  // ── Hotkey bookmarks → 30s manual clips ─────────────────────────────
  for (const bookmarkedAt of hotkeyBookmarks) {
    const offsetMs = bookmarkedAt - recordingStart
    const startMs = Math.max(0, offsetMs - 25_000)
    try {
      const tempRecord = clipStore.add({
        path: '',
        thumbPath: null,
        trigger: 'hotkey',
        map, agent,
        durationSeconds: 30,
        round: null,
        killCount: null,
        analysisJobId,
      })
      const clipPath = ClipExtractor.clipPath(tempRecord.id)
      const thumbPath = ClipExtractor.thumbPath(tempRecord.id)
      await clipExtractor.extract({ sourcePath: videoPath, startOffsetMs: startMs, durationMs: 30_000, outputPath: clipPath })
      await clipExtractor.thumbnail({ sourcePath: videoPath, offsetMs: offsetMs, outputPath: thumbPath })
      clipStore.update(tempRecord.id, { path: clipPath, thumbPath })
      extractedClipIds.push(tempRecord.id)
      logActivity(`Saved hotkey clip (${map ?? 'unknown map'})`)
    } catch (err) {
      log.warn('[ClipExtract] Hotkey clip failed:', err)
    }
  }

  // ── Kill clips from timeline ─────────────────────────────────────────
  if (timeline?.playerKills && timeline.playerKills.length > 0) {
    // Group player kills by round
    const killsByRound = new Map<number, typeof timeline.playerKills>()
    for (const kill of timeline.playerKills) {
      const r = kill.round ?? -1
      if (!killsByRound.has(r)) killsByRound.set(r, [])
      killsByRound.get(r)!.push(kill)
    }

    // Detect clutch rounds first (highest priority)
    const clutchRounds = detectClutchRounds(timeline)

    // Categorize non-clutch rounds: ace (5+), 4k, 3k → combined clips
    const combinedRounds = new Map<number, {
      kills: typeof timeline.playerKills
      trigger: 'ace' | 'multikill'
      killCount: number
    }>()
    for (const [round, kills] of killsByRound.entries()) {
      if (clutchRounds.has(round)) continue // clutch takes priority
      if (kills.length >= 5) {
        combinedRounds.set(round, { kills, trigger: 'ace', killCount: kills.length })
      } else if (kills.length >= 3) {
        combinedRounds.set(round, { kills, trigger: 'multikill', killCount: kills.length })
      }
    }

    // Individual kill clips — skip clutch and combined rounds (up to 6 clips)
    const topKills = timeline.playerKills
      .filter(k => {
        const r = k.round ?? -1
        return !clutchRounds.has(r) && !combinedRounds.has(r) && k.videoOffsetMs != null
      })
      .slice(0, 6)

    for (const kill of topKills) {
      const offsetMs = kill.videoOffsetMs!
      const startMs = Math.max(0, offsetMs - 8_000)
      try {
        const tempRecord = clipStore.add({
          path: '',
          thumbPath: null,
          trigger: 'kill',
          map, agent,
          durationSeconds: 13,
          round: kill.round ?? null,
          killCount: null,
          analysisJobId,
        })
        const clipPath = ClipExtractor.clipPath(tempRecord.id)
        const thumbPath = ClipExtractor.thumbPath(tempRecord.id)
        await clipExtractor.extract({ sourcePath: videoPath, startOffsetMs: startMs, durationMs: 13_000, outputPath: clipPath })
        await clipExtractor.thumbnail({ sourcePath: videoPath, offsetMs: offsetMs, outputPath: thumbPath })
        clipStore.update(tempRecord.id, { path: clipPath, thumbPath })
        extractedClipIds.push(tempRecord.id)
      } catch (err) {
        log.warn('[ClipExtract] Kill clip failed:', err)
      }
    }

    // Combined clips: ace (5k+), 4k, 3k
    for (const [round, { kills: roundKills, trigger, killCount }] of combinedRounds.entries()) {
      const validKills = roundKills.filter(k => k.videoOffsetMs != null)
      if (validKills.length === 0) continue
      const first = validKills.reduce((a, b) => a.videoOffsetMs! < b.videoOffsetMs! ? a : b)
      const last = validKills.reduce((a, b) => a.videoOffsetMs! > b.videoOffsetMs! ? a : b)
      const startMs = Math.max(0, first.videoOffsetMs! - 5_000)
      const durationMs = Math.min(last.videoOffsetMs! - first.videoOffsetMs! + 12_000, 120_000)
      try {
        const tempRecord = clipStore.add({
          path: '',
          thumbPath: null,
          trigger,
          map, agent,
          durationSeconds: durationMs / 1000,
          round,
          killCount,
          analysisJobId,
        })
        const clipPath = ClipExtractor.clipPath(tempRecord.id)
        const thumbPath = ClipExtractor.thumbPath(tempRecord.id)
        await clipExtractor.extract({ sourcePath: videoPath, startOffsetMs: startMs, durationMs, outputPath: clipPath })
        await clipExtractor.thumbnail({ sourcePath: videoPath, offsetMs: first.videoOffsetMs!, outputPath: thumbPath })
        clipStore.update(tempRecord.id, { path: clipPath, thumbPath })
        extractedClipIds.push(tempRecord.id)
        const label = trigger === 'ace' ? 'Ace' : `${killCount}K`
        logActivity(`${label} clip saved — Round ${round + 1} (${map ?? 'unknown'})`)
      } catch (err) {
        log.warn(`[ClipExtract] ${trigger} clip failed:`, err)
      }
    }

    // Clutch clips — 15s buffer before first kill to capture setup
    for (const round of clutchRounds) {
      const clutchKills = timeline.playerKills.filter(k => (k.round ?? -1) === round && k.videoOffsetMs != null)
      if (clutchKills.length === 0) continue
      const first = clutchKills.reduce((a, b) => a.videoOffsetMs! < b.videoOffsetMs! ? a : b)
      const last = clutchKills.reduce((a, b) => a.videoOffsetMs! > b.videoOffsetMs! ? a : b)
      const startMs = Math.max(0, first.videoOffsetMs! - 15_000)
      const durationMs = Math.min(last.videoOffsetMs! - first.videoOffsetMs! + 12_000, 120_000)
      try {
        const tempRecord = clipStore.add({
          path: '',
          thumbPath: null,
          trigger: 'clutch',
          map, agent,
          durationSeconds: durationMs / 1000,
          round,
          killCount: clutchKills.length,
          analysisJobId,
        })
        const clipPath = ClipExtractor.clipPath(tempRecord.id)
        const thumbPath = ClipExtractor.thumbPath(tempRecord.id)
        await clipExtractor.extract({ sourcePath: videoPath, startOffsetMs: startMs, durationMs, outputPath: clipPath })
        await clipExtractor.thumbnail({ sourcePath: videoPath, offsetMs: first.videoOffsetMs!, outputPath: thumbPath })
        clipStore.update(tempRecord.id, { path: clipPath, thumbPath })
        extractedClipIds.push(tempRecord.id)
        logActivity(`Clutch clip saved — Round ${round + 1} (${map ?? 'unknown'})`)
      } catch (err) {
        log.warn('[ClipExtract] Clutch clip failed:', err)
      }
    }
  }

  if (extractedClipIds.length > 0) {
    logActivity(`${extractedClipIds.length} clip${extractedClipIds.length === 1 ? '' : 's'} saved from match`)
    mainWindow?.webContents.send('clips:new', extractedClipIds)
    if (Notification.isSupported()) {
      new Notification({
        title: 'UpForge — Clips Ready',
        body: `${extractedClipIds.length} highlight clip${extractedClipIds.length === 1 ? '' : 's'} saved`,
        silent: true,
      }).show()
    }
  }

  // Reset bookmarks for next match
  hotkeyBookmarks.length = 0
  currentRecordingStartTime = null
}

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 860,
    height: 580,
    minWidth: 700,
    minHeight: 480,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0a0a0a',
    icon: join(__dirname, '../../resources/icon.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
  })

  win.on('ready-to-show', () => win.show())
  win.on('close', (e) => {
    // Minimise to tray instead of closing — unless app is actually quitting
    if (!isQuitting) {
      e.preventDefault()
      win.hide()
    }
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

function createPostGameWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 380,
    height: 300,
    resizable: false,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#0a0a0a',
    icon: join(__dirname, '../../resources/icon.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  // Position bottom-right corner
  const display = screen.getPrimaryDisplay()
  const { width, height } = display.workAreaSize
  win.setPosition(width - 400, height - 320)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/post-game`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'post-game' })
  }

  return win
}

function createTray(): void {
  const icon = nativeImage.createFromPath(join(__dirname, '../../resources/tray-icon.png'))
  tray = new Tray(icon.resize({ width: 16, height: 16 }))

  const updateTrayMenu = (): void => {
    const pendingCount = recordingsStore?.getPending().length ?? 0
    const pendingLabel = pendingCount === 1
      ? '1 recording pending analysis'
      : pendingCount > 1
        ? `${pendingCount} recordings pending analysis`
        : null

    const menuTemplate: Electron.MenuItemConstructorOptions[] = [
      {
        label: 'Open UpForge',
        click: () => {
          if (!mainWindow) {
            mainWindow = createMainWindow()
          } else {
            mainWindow.show()
            mainWindow.focus()
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Open in Browser',
        click: () => shell.openExternal('https://upforge.gg/dashboard')
      },
      { type: 'separator' },
      {
        label: 'Recording: ' + (recorder.isRecording() ? '● Active' : '○ Idle'),
        enabled: false
      },
    ]

    if (pendingLabel) {
      menuTemplate.push({
        label: pendingLabel,
        click: () => {
          if (!mainWindow) {
            mainWindow = createMainWindow()
          } else {
            mainWindow.show()
            mainWindow.focus()
          }
        }
      })
    }

    menuTemplate.push(
      { type: 'separator' },
      {
        label: 'Quit UpForge',
        click: () => {
          app.quit()
        }
      }
    )

    const menu = Menu.buildFromTemplate(menuTemplate)
    tray!.setContextMenu(menu)
  }

  tray.setToolTip('UpForge — Valorant AI Coaching')
  updateTrayMenu()

  // Single click toggles window (Mac: click fires before context menu on some versions)
  tray.on('click', () => {
    if (!mainWindow) {
      mainWindow = createMainWindow()
    } else if (mainWindow.isVisible()) {
      mainWindow.hide()
    } else {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  tray.on('double-click', () => {
    if (!mainWindow) {
      mainWindow = createMainWindow()
    } else {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  // Refresh tray menu on recording state changes (event-driven) and fall back to
  // a low-frequency interval only to catch changes in pending-recording counts.
  updateTrayMenuFn = updateTrayMenu
  trayRefreshInterval = setInterval(updateTrayMenu, 30_000)
}

function setupGameDetection(): void {
  // All known Valorant game modes returned by the Riot Local Client API
  const ALL_MODES = new Set(['COMPETITIVE', 'PREMIER', 'CLASSIC', 'DEATHMATCH', 'TEAMDEATHMATCH', 'SPIKERUSH', 'SWIFTPLAY', 'SNOWBALL'])

  /**
   * Stop recording, collect the match timeline (with Riot MatchDetails), and
   * trigger the post-game upload window. Called from both onMatchEnded and
   * game-stopped — protected by the module-level matchHandled flag.
   */
  async function handleMatchEnd(game: string): Promise<void> {
    const timeline = await riotLocalApi.stop()
    const recordingDuration = recorder.getRecordingDuration()
    const matchSessionStart = currentRecordingStartTime ?? (Date.now() - recordingDuration * 1000)
    await recorder.stop()

    const videoPath = recorder.getLastRecordingPath()
    const fileSize = recorder.getLastRecordingSize()
    const user = authManager.getUser()
    const map = timeline?.map ?? null
    const agent = timeline?.agent ?? null
    const gameMode = riotLocalApi.getLastGameMode() ?? 'UNKNOWN'
    const config = settingsManager?.get()
    const autoAnalyse = config?.autoAnalyse !== false

    tray?.setToolTip('UpForge — Valorant AI Coaching')

    const MIN_DURATION_SECONDS = 120
    const MIN_FILE_SIZE_BYTES = 1024 * 1024

    if (recordingDuration > 0 && recordingDuration < MIN_DURATION_SECONDS) {
      console.log(`[GameDetector] Recording too short (${recordingDuration}s) — ignoring`)
      logActivity(`Recording too short (${recordingDuration}s) — discarded`)
      if (videoPath && fs.existsSync(videoPath)) {
        try { fs.unlinkSync(videoPath) } catch { /* ignore */ }
      }
      return
    }

    // If recording never started (recorder.start() threw earlier in this match),
    // skip the post-game window — it would just show a confusing error.
    if (recordingDuration === 0) {
      const lastErr = recorder.getLastError()
      logActivity(lastErr ? `Match ended — no recording was made (${lastErr})` : 'Match ended — no active recording')
      return
    }

    // Close any existing post-game window first (consecutive match scenario —
    // match 2 can end before match 1's window is dismissed).
    postGameWindow?.close()
    const thisPostGameWindow = createPostGameWindow()
    postGameWindow = thisPostGameWindow
    thisPostGameWindow.on('closed', () => {
      if (postGameWindow === thisPostGameWindow) postGameWindow = null
    })

    // Notify the user that the match recording has finished and upload is starting
    if (Notification.isSupported()) {
      const agentLabel = agent ?? 'Valorant'
      const mapLabel = map ? ` on ${map}` : ''
      new Notification({
        title: 'UpForge — Recording Complete',
        body: `${agentLabel}${mapLabel} — uploading for AI analysis…`
      }).show()
    }

    thisPostGameWindow.webContents.once('did-finish-load', async () => {
      const sendToWindow = (channel: string, payload?: unknown) => {
        if (!thisPostGameWindow.isDestroyed()) thisPostGameWindow.webContents.send(channel, payload)
      }

      if (!videoPath || !fs.existsSync(videoPath)) {
        const ffmpegError = recorder.getLastError()
        const errorMsg = ffmpegError
          ? `Recording failed: ${ffmpegError}`
          : 'Recording file was not created — ffmpeg may have failed to start. Check that ffmpeg is installed (dev) or the app was not corrupted (production).'
        sendToWindow('post-game:upload-error', errorMsg)
        return
      }

      if (fileSize < MIN_FILE_SIZE_BYTES) {
        const sizeMB = (fileSize / (1024 * 1024)).toFixed(2)
        const errorMsg = `Recording appears corrupt or empty (${sizeMB} MB). Please check your ffmpeg setup.`
        console.error(`[GameDetector] ${errorMsg}`)
        sendToWindow('post-game:upload-error', errorMsg)
        return
      }

      if (!autoAnalyse) {
        const recording = recordingsStore.add({
          path: videoPath,
          riotName: user?.riot_name ?? '',
          riotTag: user?.riot_tag ?? '',
          game,
          map,
          agent,
          gameMode,
          timeline
        })
        sendToWindow('post-game:pending', {
          recordingId: recording.id,
          game,
          map,
          agent
        })
        mainWindow?.webContents.send('recordings:updated')
        // Still extract hotkey clips — user explicitly bookmarked them, don't discard
        if (hotkeyBookmarks.length > 0) {
          extractMatchClips(videoPath, timeline, null).catch(err =>
            log.warn('[ClipExtract] Hotkey clip extraction (no-analyse) error:', err)
          )
        }
        return
      }

      tray?.setToolTip('UpForge — Uploading...')
      const uploadResult = await doUploadAndAnalyse(null, videoPath, user?.riot_name ?? '', user?.riot_tag ?? '',
        game, map, agent, timeline, thisPostGameWindow, matchSessionStart)

      // Extract highlight clips from the recording in the background (non-blocking)
      const jobId = uploadResult ?? null
      extractMatchClips(videoPath, timeline, jobId).catch(err =>
        log.warn('[ClipExtract] Background extraction error:', err)
      )

      // If Riot hasn't processed the match yet (no kills in timeline), retry match details
      // after a delay — Riot typically takes 1-3 minutes to publish match data.
      const matchId = timeline?.matchId
      const hasKills = (timeline?.playerKills?.length ?? 0) > 0
      if (!hasKills && matchId) {
        log.info('[HandleMatchEnd] No kills in timeline — scheduling late match details retry in 90s')
        setTimeout(async () => {
          try {
            log.info('[LateClipExtract] Fetching match details for', matchId)
            const details = await riotLocalApi.fetchMatchDetailsLate(matchId)
            if (!details) {
              log.warn('[LateClipExtract] Match details still unavailable after delay')
              return
            }
            if (timeline) riotLocalApi.populateMatchDataFromDetails(timeline, details)
            if ((timeline?.playerKills?.length ?? 0) === 0) {
              log.warn('[LateClipExtract] Match details fetched but no kills found for this player')
              return
            }
            log.info(`[LateClipExtract] Got ${timeline!.playerKills.length} kills — extracting clips`)
            await extractKillClipsOnly(videoPath, timeline!, jobId)
          } catch (err) {
            log.warn('[LateClipExtract] Error:', err)
          }
        }, 90_000)
      }
    })
  }

  gameDetector.on('game-started', async (game: string) => {
    console.log(`[GameDetector] ${game} started`)
    logActivity(`${game === 'cs2' ? 'CS2' : 'Valorant'} detected — waiting for match`)

    const config = settingsManager?.get()

    // Auto-kill user-configured background apps before the game starts
    if (config?.pregameKillList?.length && performanceManager) {
      for (const procName of config.pregameKillList) {
        performanceManager.killProcess(procName).catch(() => {})
      }
    }

    const recorderConfig = config ? {
      quality: config.recordingQuality,
      bitrate: config.recordingBitrate,
      savePath: config.savePath,
      captureMonitor: config.captureMonitor,
    } : undefined

    // Check disk space now so the warning shows while in lobby
    const savePath = config?.savePath ?? app.getPath('userData')
    const freeBytes = await recorder.getFreeDiskSpace(savePath)
    const TWO_GB = 2 * 1024 * 1024 * 1024
    if (freeBytes < TWO_GB) {
      const freeGB = (freeBytes / (1024 ** 3)).toFixed(1)
      console.warn(`[Recorder] Low disk space: ${freeGB} GB free`)
      mainWindow?.webContents.send('app:warning', { message: `Low disk space (${freeGB} GB free) — recording may be cut short` })
      if (Notification.isSupported()) {
        new Notification({
          title: 'UpForge — Low Disk Space',
          body: `Only ${freeGB} GB free. Recording may be cut short.`,
          silent: true
        }).show()
      }
    }

    tray?.setToolTip('UpForge — Match loading...')
    mainWindow?.webContents.send('recording:waiting-for-match', { waiting: true })

    // VALORANT-Win64-Shipping.exe is the in-game process — its presence confirms a map
    // is loading or actively in progress. The Riot Live Client Data API (port 2999) was
    // deprecated; we no longer gate recording on it.
    // Wait 90 seconds for the loading screen to pass, cancelling early if the process dies.
    let matchActive = false
    let gameMode: string | null = null
    let cancelled = false
    cancelMatchWait = () => { cancelled = true }
    waitingForMatch = true

    const recordedModes = config?.recordedModes ?? ['COMPETITIVE', 'PREMIER']
    const filterByMode = recordedModes.length > 0 &&
      !([...ALL_MODES].every(m => recordedModes.includes(m)))

    // ── Presence-based match detection ────────────────────────────────────
    // Try to use the Riot Local API to detect when the match actually goes
    // INGAME, so we avoid the old blind 90s wait.  Falls back to a 90s wait
    // if the lockfile / auth is not available (rare on modern installs).
    // ──────────────────────────────────────────────────────────────────────
    let matchStartTime: number | null = null
    let modeConfident = false
    const authOk = game === 'valorant' && await riotLocalApi.initAuth()

    if (authOk) {
      logActivity('Riot Client API ready — waiting for INGAME presence')
      // Wait up to 25 minutes for INGAME (handles long Agent Select)
      const PRESENCE_TIMEOUT_MS = 25 * 60 * 1000
      const deadline = Date.now() + PRESENCE_TIMEOUT_MS
      while (Date.now() < deadline && !cancelled) {
        await new Promise((r) => setTimeout(r, 3000))
        if (cancelled) break
        const stillRunning = await gameDetector.isMatchProcessRunning()
        if (!stillRunning) { cancelled = true; break }
        try {
          const state = await riotLocalApi.getSessionState()
          if (state?.sessionLoopState === 'INGAME') {
            matchStartTime = Date.now()
            if (state.queueId) {
              gameMode = state.queueId.toUpperCase().replace(/\b(unrated)\b/i, 'CLASSIC')
              // Use the exported normalizer for an accurate label
              const { normalizeQueueId } = await import('./riot-local-api')
              gameMode = normalizeQueueId(state.queueId)
              modeConfident = true
            }
            break
          }
        } catch { /* presence endpoint not yet up — keep waiting */ }
      }
    } else {
      // Fallback: wait 90 s for the loading screen
      const LOADING_DELAY_MS = 90_000
      logActivity('Riot Client API unavailable — recording starts in 90s')
      const deadline = Date.now() + LOADING_DELAY_MS
      while (Date.now() < deadline && !cancelled) {
        await new Promise((r) => setTimeout(r, 5000))
        if (cancelled) break
        const stillRunning = await gameDetector.isMatchProcessRunning()
        if (!stillRunning) { cancelled = true; break }
      }
    }

    waitingForMatch = false
    cancelMatchWait = null
    mainWindow?.webContents.send('recording:waiting-for-match', { waiting: false })

    if (cancelled) {
      logActivity('Match cancelled (game quit during loading)')
      console.log('[GameDetector] Game quit during loading — no recording')
      tray?.setToolTip('UpForge — Valorant AI Coaching')
      return
    }

    // If presence API was available but INGAME was never seen, the player is idle
    // in the lobby (or queued and cancelled). Do NOT start recording — this is what
    // causes "hallucinated" matches when the app is left idle for 25+ minutes.
    if (authOk && matchStartTime === null) {
      logActivity('Presence timeout — no match started, returning to idle')
      console.log('[GameDetector] Presence loop timed out without INGAME — not recording')
      tray?.setToolTip('UpForge — Valorant AI Coaching')
      // Re-arm: if the game process is still alive, re-enter the detection loop
      // so we catch the next match the player queues into.
      await new Promise((r) => setTimeout(r, 5000))
      if (await gameDetector.isMatchProcessRunning()) {
        console.log('[GameDetector] Game still running after presence timeout — re-arming detection')
        gameDetector.emit('game-started', game)
      }
      return
    }

    // If presence didn't give us a mode, try the log file as last resort
    if (!modeConfident) {
      const logMode = await riotLocalApi.getGameModeFromLog()
      if (logMode) { gameMode = logMode; modeConfident = true }
    }

    if (filterByMode && modeConfident && gameMode && !recordedModes.includes(gameMode)) {
      console.log(`[GameDetector] Skipping recording — mode is ${gameMode} (not in recordedModes)`)
      logActivity(`Mode ${gameMode} not in recorded modes — skipped`)
      tray?.setToolTip('UpForge — Valorant AI Coaching')
      return
    }

    if (!gameMode) gameMode = 'COMPETITIVE'
    matchActive = true
    matchHandled = false

    logActivity(`Match detected (${gameMode}${modeConfident ? '' : '?'}) — starting recording`)
    console.log(`[GameDetector] Match confirmed! gameMode=${gameMode} confident=${modeConfident} matchStartTime=${matchStartTime}`)

    // Wire up onMatchEnded — fires when presence transitions INGAME → MENUS.
    // This is the primary way we know the match ended (before the process dies).
    riotLocalApi.onMatchEnded = async () => {
      if (matchHandled) return
      matchHandled = true
      console.log('[RiotLocalApi] onMatchEnded fired — stopping recording')
      logActivity('Match ended (presence) — stopping recording')
      await handleMatchEnd(game)

      // VALORANT-Win64-Shipping.exe often stays alive between consecutive matches
      // (the user returns to lobby and queues again without relaunching the client).
      // In that case game-stopped never fires and game-started never re-fires, so
      // nothing would detect the next match. Re-enter the full detection loop if
      // the process is still running. This also covers back-to-back Deathmatch sessions.
      await new Promise((r) => setTimeout(r, 5000)) // let the post-game lobby settle
      if (await gameDetector.isMatchProcessRunning()) {
        console.log('[GameDetector] Game still running after match — watching for next match')
        logActivity('Watching for next match...')
        gameDetector.emit('game-started', game)
      }
    }

    // Start tracking + recording
    // Pass matchStartTime so the API can compute videoOffsetMs once we have recording start.
    riotLocalApi.start(game, matchStartTime ?? undefined)

    tray?.setToolTip('UpForge — Starting recorder...')
    mainWindow?.webContents.send('recording:starting', { starting: true })
    try {
      await recorder.start(game, recorderConfig)
      // Update recordingStartTime to the moment the recorder actually began capturing.
      // This makes videoOffsetMs accurate: offset = (matchStart - recordingStart) + timeSinceGameStart.
      const recStartTime = Date.now()
      riotLocalApi.setRecordingStartTime(recStartTime)
      currentRecordingStartTime = recStartTime
      hotkeyBookmarks.length = 0 // clear any stale bookmarks from previous match
      // Push recording=true to the overlay immediately — don't wait for the poll cycle
      sendOverlayData('overlay:data', { round: null, allyScore: null, enemyScore: null, yourCredits: null, enemyEstimate: null, recording: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[Main] Failed to start recording:', msg)
      logActivity(`Recording failed to start: ${msg}`)
      mainWindow?.webContents.send('recording:starting', { starting: false })
      tray?.setToolTip('UpForge — Recording failed!')
      if (Notification.isSupported()) {
        new Notification({
          title: 'UpForge — Recording Failed',
          body: 'Could not start recording. Open UpForge to see details.',
          silent: false
        }).show()
      }
      // Reset tray tooltip after 10 seconds so it doesn't stay on "failed"
      setTimeout(() => tray?.setToolTip('UpForge — Valorant AI Coaching'), 10_000)
      return
    }
    logActivity(`Recording started (${gameMode ?? 'unknown mode'}${recorder.wasNoAudio() ? ' — no audio' : ''})`)

    // Start polling session state to feed the live overlay with round data
    overlayPollTimer = setInterval(async () => {
      try {
        const state = await riotLocalApi.getSessionState()
        if (state?.sessionLoopState === 'INGAME') {
          const round = (state.allyScore ?? 0) + (state.enemyScore ?? 0) + 1
          sendOverlayData('overlay:data', {
            round,
            allyScore: state.allyScore ?? 0,
            enemyScore: state.enemyScore ?? 0,
            yourCredits: null,
            enemyEstimate: null,
            recording: true,
          })
        }
      } catch { /* ignore — session endpoint may be unavailable */ }
    }, 5_000)

    // Stop overlay polling when the match ends
    const origOnMatchEnded = riotLocalApi.onMatchEnded
    riotLocalApi.onMatchEnded = async () => {
      if (overlayPollTimer) { clearInterval(overlayPollTimer); overlayPollTimer = null }
      sendOverlayData('overlay:data', { round: null, allyScore: null, enemyScore: null, yourCredits: null, enemyEstimate: null, recording: false })
      if (origOnMatchEnded) await origOnMatchEnded()
    }

    if (recorder.wasNoAudio()) {
      mainWindow?.webContents.send('app:warning', {
        message: 'Recording started without audio — your system audio device was unavailable'
      })
    }

    const user = authManager.getUser()
    const userLabel = (user?.riot_name && user?.riot_tag)
      ? `${user.riot_name}#${user.riot_tag}`
      : user?.name ?? 'your account'
    const gameLabel = game === 'cs2' ? 'CS2' : 'Valorant'
    tray?.setToolTip(`UpForge — Recording ${gameLabel} (${userLabel})`)

    if (Notification.isSupported()) {
      new Notification({
        title: `UpForge is recording`,
        body: `${gameLabel} match started for ${userLabel}`,
        silent: true
      }).show()
    }
  })

  gameDetector.on('game-stopped', async (game: string) => {
    console.log(`[GameDetector] ${game} stopped`)

    // Game quit while still in lobby (before match started)
    if (cancelMatchWait) {
      cancelMatchWait()
      cancelMatchWait = null
      waitingForMatch = false
      mainWindow?.webContents.send('recording:waiting-for-match', { waiting: false })
      tray?.setToolTip('UpForge — Valorant AI Coaching')
      console.log('[GameDetector] Game quit before match — no recording to save')
      logActivity('Game quit before match started — nothing recorded')
      return
    }

    // Presence already fired onMatchEnded and the match was handled — nothing to do
    if (matchHandled) {
      console.log('[GameDetector] Match already handled by onMatchEnded — skipping game-stopped')
      riotLocalApi.onMatchEnded = null
      return
    }

    // Process died without a clean presence transition (crash, force-quit, etc.)
    matchHandled = true
    if (overlayPollTimer) { clearInterval(overlayPollTimer); overlayPollTimer = null }
    sendOverlayData('overlay:data', { round: null, allyScore: null, enemyScore: null, yourCredits: null, enemyEstimate: null, recording: false })
    logActivity('Game process ended — stopping recording')
    await handleMatchEnd(game)
  })

  gameDetector.start()
}

/**
 * Resume polling for a job that was in-flight when the app last crashed.
 * Runs the same exponential-backoff loop as doUploadAndAnalyse, but sends
 * results to the main window (no post-game window needed).
 */
async function resumePollForJob(
  jobId: string,
  context: { agent?: string; map?: string; game?: string }
): Promise<void> {
  const { agent = null, map = null } = context
  logActivity(`Resuming analysis poll for job ${jobId}`)
  tray?.setToolTip('UpForge — Analysing (resumed)…')

  const startTime = Date.now()
  let pollFailCount = 0
  let pollDelay = 5_000

  const schedulePoll = () => {
    setTimeout(pollOnce, pollDelay)
    pollDelay = Math.min(Math.round(pollDelay * 1.5), 30_000)
  }

  const pollOnce = async () => {
    try {
      const status = await uploadManager.pollStatus(jobId)
      pollFailCount = 0
      if (status.status === 'completed' && status.result) {
        const score = (status.result as Record<string, unknown>).overall_score as number | undefined
        logActivity(`Resumed analysis ready${score != null ? ` — Score: ${score}/100` : ''}`)
        clearPendingJob()
        mainWindow?.webContents.send('dashboard:refresh')
        tray?.setToolTip('UpForge — Valorant AI Coaching')
        if (Notification.isSupported()) {
          const notifAgent = agent ?? 'Valorant'
          const notifMap = map ? ` on ${map}` : ''
          const notifScore = score != null ? ` — Score: ${score}/100` : ''
          new Notification({
            title: 'UpForge — Analysis Ready',
            body: `${notifAgent}${notifMap}${notifScore}`
          }).show()
        }
      } else if (status.status === 'failed') {
        logActivity('Resumed analysis failed — retry from the dashboard')
        clearPendingJob()
        tray?.setToolTip('UpForge — Valorant AI Coaching')
        if (Notification.isSupported()) {
          new Notification({
            title: 'UpForge — Analysis Failed',
            body: 'Your previous analysis failed. You can retry it from the dashboard.'
          }).show()
        }
        mainWindow?.webContents.send('dashboard:refresh')
      } else if (Date.now() - startTime > 600_000) {
        logActivity('Resumed analysis poll timed out after 10 minutes')
        clearPendingJob()
        tray?.setToolTip('UpForge — Valorant AI Coaching')
      } else {
        schedulePoll()
      }
    } catch (pollErr) {
      pollFailCount++
      if (pollFailCount >= 5) {
        logActivity('Resumed poll — lost connection to server')
        clearPendingJob()
        tray?.setToolTip('UpForge — Valorant AI Coaching')
      } else {
        schedulePoll()
      }
    }
  }

  schedulePoll()
}

/** Upload a recording and poll for the analysis result, sending IPC events to `targetWindow`. */
async function doUploadAndAnalyse(
  recordingId: string | null,
  videoPath: string,
  riotName: string,
  riotTag: string,
  game: string,
  map: string | null,
  agent: string | null,
  timeline: MatchData | null,
  targetWindow: BrowserWindow,
  sessionStart = 0
): Promise<string | null> {
  const send = (channel: string, payload?: unknown) => {
    if (!targetWindow.isDestroyed()) targetWindow.webContents.send(channel, payload)
  }
  try {
    send('post-game:upload-start', { game, map, agent })
    logActivity(`Uploading recording${map ? ` (${map}${agent ? ` · ${agent}` : ''})` : ''}`)

    const result = await uploadManager.upload({
      videoPath,
      riotName,
      riotTag,
      game,
      map,
      agent,
      timeline,
      onProgress: (pct) => {
        send('post-game:upload-progress', pct)
      }
    })

    send('post-game:upload-complete', { jobId: result.job_id })
    logActivity('Upload complete — AI analysis running')
    tray?.setToolTip('UpForge — Analysing...')

    // Mark as analysed in store (if this was a saved recording)
    if (recordingId) {
      recordingsStore.markAnalysed(recordingId, result.job_id)
      mainWindow?.webContents.send('recordings:updated')
    }

    // Auto-delete after upload if configured
    if (settingsManager?.get().autoDelete) {
      recorder.deleteRecording(videoPath)
    }

    // Poll for analysis result (up to 10 minutes) with exponential backoff
    const startTime = Date.now()
    let pollFailCount = 0
    let pollDelay = 5_000
    let pollTimer: ReturnType<typeof setTimeout> | null = null

    const schedulePoll = () => {
      pollTimer = setTimeout(pollOnce, pollDelay)
      pollDelay = Math.min(Math.round(pollDelay * 1.5), 30_000)
    }

    const pollOnce = async () => {
      try {
        const status = await uploadManager.pollStatus(result.job_id)
        pollFailCount = 0
        if (status.status === 'completed' && status.result) {
          const score = (status.result as Record<string, unknown>).overall_score as number | undefined
          const analysisId = (status.result as Record<string, unknown>).analysis_id as number | undefined
          const improvements = (status.result as Record<string, unknown>).priority_improvements as string[] | undefined
          const topIssue = (status.result as Record<string, unknown>).top_issue as string | undefined
          const insightText = (improvements && improvements.length > 0) ? improvements[0] : (topIssue ?? null)
          logActivity(`Analysis ready${score != null ? ` — Score: ${score}/100` : ''}`)
          clearPendingJob()
          if (insightText) {
            const insight = { text: insightText, score: score ?? 0, agent: agent ?? null, analysisId: analysisId ?? null, date: new Date().toISOString() }
            settingsManager.save({ lastInsight: insight })
            mainWindow?.webContents.send('dashboard:last-insight', insight)
          }
          // Derive match result from round scores (last entry = final score)
          const lastScore = timeline?.roundScores?.length
            ? timeline.roundScores[timeline.roundScores.length - 1]
            : null
          const matchResult: 'win' | 'loss' | null = lastScore
            ? (lastScore.allyScore > lastScore.enemyScore ? 'win' : 'loss')
            : null

          send('post-game:analysis-ready', {
            overall_score: (status.result as Record<string, unknown>).overall_score,
            analysis_id: (status.result as Record<string, unknown>).analysis_id,
            top_issue: (status.result as Record<string, unknown>).top_issue,
            priority_improvements: (status.result as Record<string, unknown>).priority_improvements,
            session_start: sessionStart,
            kills: timeline?.finalStats?.kills ?? null,
            deaths: timeline?.finalStats?.deaths ?? null,
            assists: timeline?.finalStats?.assists ?? null,
            match_result: matchResult,
            ally_score: lastScore?.allyScore ?? null,
            enemy_score: lastScore?.enemyScore ?? null,
          })
          mainWindow?.webContents.send('dashboard:refresh')
          tray?.setToolTip('UpForge — Valorant AI Coaching')
          const notifAgent = agent ?? 'Valorant'
          const notifMap = map ? ` on ${map}` : ''
          const notifScore = score != null ? ` — Score: ${score}/100` : ''
          new Notification({
            title: 'UpForge — Analysis Ready',
            body: `${notifAgent}${notifMap}${notifScore}`
          }).show()
        } else if (status.status === 'failed') {
          logActivity('Analysis failed')
          clearPendingJob()
          send('post-game:upload-error', 'Analysis failed. Please try again.')
          tray?.setToolTip('UpForge — Valorant AI Coaching')
        } else if (Date.now() - startTime > 600_000) {
          logActivity('Analysis timed out')
          clearPendingJob()
          send('post-game:upload-error', 'Analysis timed out.')
          tray?.setToolTip('UpForge — Valorant AI Coaching')
        } else {
          schedulePoll()
        }
      } catch (pollErr) {
        pollFailCount++
        console.warn(`[Upload] Poll error (${pollFailCount}):`, pollErr)
        if (pollFailCount >= 5) {
          logActivity('Analysis polling failed — lost connection to server')
          send('post-game:upload-error', 'Lost connection while waiting for analysis. Check your internet connection.')
          tray?.setToolTip('UpForge — Valorant AI Coaching')
        } else {
          schedulePoll()
        }
      }
    }

    schedulePoll()
    return result.job_id
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Upload failed'
    logActivity(`Upload failed: ${msg}`)
    tray?.setToolTip('UpForge — Valorant AI Coaching')

    // Try to ensure the recording is saved to the pending store so the user can retry.
    // If this is the first attempt (no recordingId yet) and the file still exists, save now.
    let effectiveRecordingId = recordingId
    if (!recordingId && fs.existsSync(videoPath)) {
      try {
        const user = authManager.getUser()
        const saved = recordingsStore.add({
          path: videoPath,
          riotName: riotName || user?.riot_name || '',
          riotTag: riotTag || user?.riot_tag || '',
          game,
          map,
          agent,
          gameMode: riotLocalApi.getLastGameMode() ?? 'UNKNOWN',
          timeline
        })
        effectiveRecordingId = saved.id
        mainWindow?.webContents.send('recordings:updated')
        logActivity('Recording saved — can retry from the post-game window or dashboard')
      } catch {
        // Store save failed — fall through with no recordingId
      }
    }

    // Send the error with the recordingId (if we have one) so the renderer can offer retry.
    // The payload is either a plain string (legacy, for analysis polling errors) or an object.
    send('post-game:upload-error', effectiveRecordingId
      ? { message: msg, recordingId: effectiveRecordingId }
      : msg
    )
    return null
  }
}

function createSplashWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 560,
    height: 360,
    resizable: false,
    frame: false,
    center: true,
    skipTaskbar: false,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/splash`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'splash' })
  }

  return win
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('gg.upforge.desktop')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  uploadManager = new UploadManager(authManager)
  settingsManager = new SettingsManager()
  recordingsStore = new RecordingsStore()

  // Restore auth session from keychain before creating window
  try {
    await authManager.loadStoredToken()
  } catch (err) {
    log.warn('[App] Failed to restore auth token — starting unauthenticated:', err)
  }

  // Resume polling for any job_id that was persisted before a crash.
  // We wait until the main window is ready before sending the result.
  const orphanedJob = readPendingJob()
  if (orphanedJob) {
    console.log('[App] Orphaned job found from previous session:', orphanedJob.job_id)
  }

  // Show splash launcher while we check for updates
  const splashWindow = createSplashWindow()

  createTray()

  // Called when updater confirms no update pending (or errors out).
  // Close splash and open the main window.
  const launchMainApp = () => {
    mainWindow = createMainWindow()
    setupGameDetection()
    // Small delay so main window is loaded before splash closes
    setTimeout(() => {
      if (!splashWindow.isDestroyed()) splashWindow.close()
    }, 400)

    // If an orphaned job was found at startup, resume the full poll loop once the window loads
    if (orphanedJob) {
      mainWindow.webContents.once('did-finish-load', () => {
        resumePollForJob(orphanedJob.job_id, {
          agent: orphanedJob.agent,
          map: orphanedJob.map,
          game: orphanedJob.game,
        })
      })
    }
  }

  setupAutoUpdater(splashWindow, launchMainApp, () => { isQuitting = true })

  // Verify ffmpeg is accessible and log a warning if not — better to know early
  recorder.preflight().then((result) => {
    ffmpegOk = result.ok
    if (!result.ok) {
      console.error('[App] ffmpeg preflight FAILED:', result.error)
      if (Notification.isSupported()) {
        new Notification({
          title: 'UpForge — Recording Unavailable',
          body: `ffmpeg not found: ${result.error ?? 'unknown error'}. Recording will not work.`
        }).show()
      }
      // Push the warning to the dashboard if it's already open
      mainWindow?.webContents.send('app:ffmpeg-status', { ok: false })
    } else {
      console.log('[App] ffmpeg preflight OK')
    }
  }).catch((err) => {
    console.error('[App] ffmpeg preflight threw unexpectedly:', err)
    ffmpegOk = false
  })
  setupIpcHandlers(ipcMain, authManager, recorder, gameDetector, settingsManager, () => {
    postGameWindow = createPostGameWindow()
    postGameWindow.webContents.once('did-finish-load', () => {
      postGameWindow?.webContents.send('post-game:upload-start', { game: 'valorant', map: 'Bind', agent: 'Jett' })
      setTimeout(() => postGameWindow?.webContents.send('post-game:upload-progress', 45), 800)
      setTimeout(() => postGameWindow?.webContents.send('post-game:upload-progress', 100), 1600)
      setTimeout(() => postGameWindow?.webContents.send('post-game:upload-complete', {}), 2000)
      setTimeout(() => postGameWindow?.webContents.send('post-game:analysis-ready', {
        overall_score: 72,
        analysis_id: 999,
        session_start: Date.now() - 60 * 60 * 1000,
        top_issue: 'Positioning during post-plant — you were caught in the open on 4 of 6 clutch attempts.',
        priority_improvements: [
          'Positioning during post-plant — caught in the open on 4 of 6 clutch attempts.',
          'Crosshair placement — pre-aiming head height on B site entries.',
          'Economy — force-buying after pistol loss reduced overall round win rate.'
        ]
      }), 5500)
    })
  }, () => ffmpegOk, () => waitingForMatch, () => activityLog.slice(), uploadManager, () => {
    // Show main window and navigate to clips tab
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show()
      mainWindow.focus()
      mainWindow.webContents.send('app:navigate', '/clips')
    }
  }, performanceManager)

  setupClipHandlers(ipcMain, clipStore, clipExtractor, authManager, hotkeyManager)

  // Overlay clip button — same as pressing F9
  ipcMain.handle('clips:save-bookmark', () => {
    if (recorder.isRecording() && currentRecordingStartTime !== null) {
      hotkeyBookmarks.push(Date.now())
      logActivity('Clip moment bookmarked (overlay button)')
      log.info('[Overlay] Clip bookmarked via button, total:', hotkeyBookmarks.length)
      const elapsedSec = Math.round((Date.now() - currentRecordingStartTime) / 1000)
      sendOverlayData('overlay:clip-bookmarked', { bookmarkCount: hotkeyBookmarks.length, elapsedSec })
      return { ok: true, bookmarkCount: hotkeyBookmarks.length }
    }
    return { ok: false, reason: 'not-recording' }
  })

  // Presence heartbeat — update squad presence every 60s when authenticated
  const presenceInterval = setInterval(() => {
    if (!authManager.isAuthenticated()) return
    authManager.sendPresence(recorder.isRecording(), gameDetector.currentGame())
      .catch(() => { /* ignore */ })
  }, 60000)

  app.on('before-quit', () => clearInterval(presenceInterval))

  // Register global hotkeys
  hotkeyManager.on('save-clip', () => {
    if (recorder.isRecording() && currentRecordingStartTime !== null) {
      hotkeyBookmarks.push(Date.now())
      logActivity('Clip moment bookmarked (F9)')
      log.info('[Hotkey] F9 clip bookmarked, total bookmarks:', hotkeyBookmarks.length)
      const elapsedSec = Math.round((Date.now() - currentRecordingStartTime) / 1000)
      sendOverlayData('overlay:clip-bookmarked', { bookmarkCount: hotkeyBookmarks.length, elapsedSec })
      // Auto-show overlay so user sees the toast even if they didn't press F10
      // If overlay is already visible (user opened it themselves), don't auto-hide it
      if (!isOverlayVisible()) {
        if (overlayAutoHideTimer) clearTimeout(overlayAutoHideTimer)
        showOverlay()
        overlayAutoHideTimer = setTimeout(() => {
          // Only auto-hide if the user didn't manually show it (it would still be visible via F10)
          hideOverlay()
          overlayAutoHideTimer = null
        }, 3000)
      }
    } else {
      // F9 was pressed but we're not recording — give the user visible feedback in overlay + notification
      log.warn('[Hotkey] F9 pressed but recorder is not active (recording=%s, startTime=%s)',
        recorder.isRecording(), currentRecordingStartTime)
      logActivity('F9 pressed — not recording (start a Valorant match first)')
      sendOverlayData('overlay:clip-not-recording', {})
      if (!isOverlayVisible()) {
        if (overlayAutoHideTimer) clearTimeout(overlayAutoHideTimer)
        showOverlay()
        overlayAutoHideTimer = setTimeout(() => { hideOverlay(); overlayAutoHideTimer = null }, 3000)
      }
    }
  })
  hotkeyManager.on('take-screenshot', () => {
    log.info('[Hotkey] F8 screenshot requested')
    logActivity('Screenshot saved (F8)')
    sendOverlayData('overlay:screenshot', {})
    // Auto-show overlay briefly so user sees the confirmation toast
    if (!isOverlayVisible()) {
      if (overlayAutoHideTimer) clearTimeout(overlayAutoHideTimer)
      showOverlay()
      overlayAutoHideTimer = setTimeout(() => { hideOverlay(); overlayAutoHideTimer = null }, 3000)
    }
  })
  hotkeyManager.on('toggle-overlay', () => {
    // If the auto-hide timer is running (from an F9 flash), cancel it — user is taking manual control
    if (overlayAutoHideTimer) { clearTimeout(overlayAutoHideTimer); overlayAutoHideTimer = null }
    toggleOverlay()
    // When overlay becomes visible, push current recording state immediately
    // so the user sees the correct status without waiting for the next poll cycle
    if (isOverlayVisible()) {
      sendOverlayData('overlay:data', {
        round: null,
        allyScore: null,
        enemyScore: null,
        yourCredits: null,
        enemyEstimate: null,
        recording: recorder.isRecording(),
      })
    }
  })
  const hotkeyResults = hotkeyManager.registerAll()
  if (!hotkeyResults['save-clip']) {
    log.error('[Main] F9 (save-clip) hotkey failed to register — clips cannot be bookmarked via keyboard')
    logActivity('WARNING: F9 hotkey failed to register (may be in use by another app)')
  }

  createOverlayWindow()

  // Debug: test Riot Live Client API connection — returns raw response or error details
  ipcMain.handle('debug:test-riot-api', async () => {
    const net = await import('net')
    // TCP check on port 2999 (deprecated Live Client API — expected closed in 2026)
    const portOpen = await new Promise<boolean>((resolve) => {
      const socket = new net.Socket()
      socket.setTimeout(2000)
      socket.on('connect', () => { socket.destroy(); resolve(true) })
      socket.on('error', () => resolve(false))
      socket.on('timeout', () => { socket.destroy(); resolve(false) })
      socket.connect(2999, '127.0.0.1')
    })
    const gameMode = await riotLocalApi.getGameMode()
    const logGameMode = await riotLocalApi.getGameModeFromLog()
    const processRunning = await gameDetector.isMatchProcessRunning()
    return { portOpen, gameMode, logGameMode, processRunning }
  })


  ipcMain.handle('recordings:get', () => recordingsStore.getPending())

  ipcMain.handle('recordings:analyse', async (_e, { id }: { id: string }) => {
    const recording = recordingsStore.getById(id)
    if (!recording) return { error: 'Recording not found' }

    const user = authManager.getUser()

    const triggerAnalysis = async (win: BrowserWindow) => {
      await doUploadAndAnalyse(
        recording.id,
        recording.path,
        recording.riotName || user?.riot_name || '',
        recording.riotTag || user?.riot_tag || '',
        recording.game,
        recording.map,
        recording.agent,
        recording.timeline,
        win
      )
    }

    if (!postGameWindow || postGameWindow.isDestroyed()) {
      postGameWindow = createPostGameWindow()
      postGameWindow.webContents.once('did-finish-load', () => triggerAnalysis(postGameWindow!))
    } else {
      postGameWindow.show()
      postGameWindow.focus()
      // Window is already loaded — trigger directly
      triggerAnalysis(postGameWindow)
    }

    return { ok: true }
  })

  ipcMain.handle('recordings:dismiss', (_e, { id }: { id: string }) => {
    recordingsStore.remove(id)
    mainWindow?.webContents.send('recordings:updated')
  })

  ipcMain.handle('recordings:get-timeline', (_e, { id }: { id: string }) => {
    const recording = recordingsStore.getById(id)
    if (!recording) return null
    const tl = recording.timeline
    return {
      id: recording.id,
      videoPath: recording.path,
      map: recording.map,
      agent: recording.agent,
      game: recording.game,
      gameMode: recording.gameMode,
      recordedAt: recording.recordedAt,
      kills: tl?.playerKills ?? [],
      deaths: tl?.playerDeaths ?? [],
      roundSummaries: tl?.roundSummaries ?? [],
      finalStats: tl?.finalStats ?? null,
      teamSnapshot: tl?.teamSnapshot ?? [],
    }
  })

  // Register global shortcut to show/focus window
  globalShortcut.register('CommandOrControl+Shift+U', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })
})

// Re-show window when clicking dock icon on Mac
app.on('activate', () => {
  if (!mainWindow) {
    mainWindow = createMainWindow()
  } else {
    mainWindow.show()
    mainWindow.focus()
  }
})

app.on('window-all-closed', () => {
  // Don't quit when all windows close — keep running in tray
})

app.on('before-quit', () => {
  isQuitting = true
  if (trayRefreshInterval) clearInterval(trayRefreshInterval)
  tray?.destroy()
  tray = null
  gameDetector.stop()
  recorder.forceStop()
  hotkeyManager.unregisterAll()
  globalShortcut.unregisterAll()
  destroyOverlay()
})
