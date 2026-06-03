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
  globalShortcut,
  desktopCapturer,
  session
} from 'electron'
import { join } from 'path'
import fs from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { setupAutoUpdater, markStartupComplete } from './updater'
import { GameDetector } from './game-detector'
import { Recorder } from './recorder'
import { OBSRecorder } from './obs-recorder'
import { RiotLocalApi } from './riot-local-api'
import { UploadManager, savePendingJob, clearPendingJob, readPendingJob } from './upload-manager'
import { AuthManager } from './auth-manager'
import { SettingsManager } from './settings-manager'
import { setupIpcHandlers, setupClipHandlers, consumePendingCaptureSourceId, cancelAllPollingTimers } from './ipc-handlers'
import { UpgradeRequiredError } from './errors'
import { RecordingsStore } from './recordings-store'
import { ClipExtractor } from './clip-extractor'
import { ClipStore } from './clip-store'
import { HotkeyManager } from './hotkey-manager'
import { createOverlayWindow, toggleOverlay, destroyOverlay, sendOverlayData, isOverlayVisible, showOverlay, hideOverlay } from './overlay-window'
import { PerformanceManager } from './performance-manager'
import { TrainerBridge } from './trainer-bridge'
import type { MatchData } from './riot-local-api'
import log from 'electron-log'
import { setupMainProcessErrorHandlers, reportError } from './error-reporter'
import { findLatestCS2Demo } from './cs2-demo-finder'
import { CS2DemoUploader } from './cs2-demo-uploader'
import { DiscordRPC } from './discord-rpc'

/** Human-readable label for a game identifier. */
function gameLabel(game?: string | null): string {
  if (game === 'cs2') return 'CS2'
  if (game === 'deadlock') return 'Deadlock'
  return 'Valorant'
}

/** Idle tray tooltip for a given game (or generic if unknown). */
function idleTooltip(game?: string | null): string {
  return `UpForge — ${gameLabel(game)} AI Coaching`
}

// Disable GPU acceleration in dev to prevent GPU process crashes on macOS
if (!app.isPackaged) {
  app.disableHardwareAcceleration()
  app.commandLine.appendSwitch('no-sandbox')
  app.commandLine.appendSwitch('disable-features', 'OutOfProcessSystemDnsResolution')
  app.commandLine.appendSwitch('disable-renderer-backgrounding')
}

// Catch any floating promise rejections in the main process before they
// crash Electron silently. Log them so they show up in support logs.
// Full error reporting is set up after AuthManager is ready (see below).

// Enforce single instance — if another UpForge process is already running,
// focus its window and quit this one immediately.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  log.warn('[App] Another instance is already running — quitting duplicate.')
  app.quit()
  process.exit(0)
}

let tray: Tray | null = null
let mainWindow: BrowserWindow | null = null
let postGameWindow: BrowserWindow | null = null
let isQuitting = false
let trayRefreshInterval: ReturnType<typeof setInterval> | null = null
let updateTrayMenuFn: (() => void) | null = null
let ffmpegOk = true // updated after preflight; exposed via app:get-status

const gameDetector = new GameDetector()
const recorder = new Recorder()
const obsRecorder = new OBSRecorder(() => {
  const s = settingsManager?.get()
  return {
    host: s?.obsHost ?? 'localhost',
    port: s?.obsPort ?? 4455,
    password: s?.obsPassword ?? '',
    replayBufferSeconds: s?.obsReplayBufferSeconds ?? 30,
  }
})

/** Returns the active recorder — OBS when enabled & connected, desktopCapturer otherwise. */
function activeRecorder(): Recorder | OBSRecorder {
  if (settingsManager?.get().obsEnabled && obsRecorder.isConnected()) return obsRecorder
  return recorder
}
const clipExtractor = new ClipExtractor()
const clipStore = new ClipStore()
const hotkeyManager = new HotkeyManager()
const trainerBridge = new TrainerBridge(() => mainWindow)
const discordRPC = new DiscordRPC()
recorder.onStatusChange = (recording, error) => {
  mainWindow?.webContents.send('recording:status-changed', { recording, error: error ?? null })
  updateTrayMenuFn?.() // keep tray in sync without waiting for the 30s interval
  // Update Discord presence on recording state change
  if (recording) {
    discordRPC.setRecording(gameDetector.currentGame() || 'valorant', new Date())
  } else if (gameDetector.currentGame()) {
    discordRPC.setInGame(gameDetector.currentGame()!)
  } else {
    discordRPC.setIdle()
  }
  // If recording stopped unexpectedly due to an error, show a system notification
  // so the user knows even if UpForge is in the background during a game
  if (!recording && error) {
    console.warn('[Main] Recording stopped with error:', error)
    tray?.setToolTip('UpForge — Recording stopped!')
    if (Notification.isSupported()) {
      new Notification({
        title: 'UpForge — Recording Stopped',
        body: 'Recording stopped unexpectedly. Open UpForge to see details.',
        silent: notifySilent()
      }).show()
    }
    setTimeout(() => tray?.setToolTip(idleTooltip()), 10_000)
  }
}
const riotLocalApi = new RiotLocalApi()
const authManager = new AuthManager()

// Set up crash/error reporting now that authManager is available
setupMainProcessErrorHandlers(authManager)
trainerBridge.setAuthManager(authManager)

// OBS recorder callbacks — mirror the same tray/notification behaviour as desktopCapturer
obsRecorder.onStatusChange = (recording, error) => {
  mainWindow?.webContents.send('recording:status-changed', { recording, error: error ?? null })
  updateTrayMenuFn?.()
  if (!recording && error) {
    console.warn('[Main] OBS recording stopped with error:', error)
    tray?.setToolTip('UpForge — Recording stopped!')
    if (Notification.isSupported()) {
      new Notification({
        title: 'UpForge — OBS Recording Stopped',
        body: error,
        silent: notifySilent()
      }).show()
    }
    setTimeout(() => tray?.setToolTip(idleTooltip()), 10_000)
  }
}

// When OBS saves a replay buffer clip during a live match, add it to the clip store immediately
obsRecorder.onReplayClipSaved = (clipPath, _trigger) => {
  log.info('[Main] OBS replay clip saved during match:', clipPath)
  const rec = clipStore.add({
    path: clipPath,
    thumbPath: null,
    trigger: 'kill',
    map: null,
    agent: null,
    durationSeconds: settingsManager?.get().obsReplayBufferSeconds ?? 30,
    round: null,
    killCount: 1,
    analysisJobId: null,
  })
  logActivity('OBS kill clip saved')
  mainWindow?.webContents.send('clips:new', [rec.id])
  mainWindow?.webContents.send('obs:replay-saved', { clipId: rec.id, path: clipPath })
}

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
// The recorder instance chosen at match start (OBS if connected & enabled, else FFmpeg Recorder).
// Stored so start/stop/getPath always use the same instance for a given match.
let currentActiveRecorder: Recorder | OBSRecorder = recorder
// Auto-hide timer for overlay flash feedback (clip bookmarked while overlay is hidden)
let overlayAutoHideTimer: ReturnType<typeof setTimeout> | null = null

// Last match diagnostic — captured at handleMatchEnd for the developer panel
interface LastMatchDiagnostic {
  timestamp: number
  matchId: string | null
  map: string | null
  agent: string | null
  gameMode: string
  recordingDuration: number
  fileSizeMb: number
  killsInTimeline: number
  clipsExtracted: number
  matchDetailsStatus: 'fetched' | 'no_match_id' | 'no_region' | 'no_auth' | 'fetch_failed' | 'pending'
}
let lastMatchDiagnostic: LastMatchDiagnostic | null = null

function logActivity(message: string): void {
  const entry = { time: Date.now(), message }
  activityLog.push(entry)
  if (activityLog.length > MAX_LOG_ENTRIES) activityLog.shift()
  mainWindow?.webContents.send('app:activity-log', activityLog.slice())
}

function notifySilent(): boolean {
  return !(settingsManager?.get().notificationSound ?? true)
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
  if (!fs.existsSync(videoPath)) {
    log.warn('[LateClipExtract] Source video not found — skipping:', videoPath)
    logActivity('Late clip extraction skipped — recording file not found')
    return
  }
  if (!timeline.playerKills || timeline.playerKills.length === 0) {
    log.warn('[LateClipExtract] No player kills in timeline — nothing to clip')
    return
  }

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
    const preBuffer = trigger === 'ace' ? 10_000 : 8_000
    const postBuffer = trigger === 'ace' ? 20_000 : 18_000
    const startMs = Math.max(0, first.videoOffsetMs! - preBuffer)
    const durationMs = Math.min(last.videoOffsetMs! - first.videoOffsetMs! + postBuffer, 120_000)
    try {
      const tempRecord = clipStore.add({ path: '', thumbPath: null, trigger, map, agent, durationSeconds: durationMs / 1000, round, killCount, analysisJobId })
      const clipPath = ClipExtractor.clipPath(tempRecord.id)
      const thumbPath = ClipExtractor.thumbPath(tempRecord.id)
      await clipExtractor.extract({ sourcePath: videoPath, startOffsetMs: startMs, durationMs, outputPath: clipPath })
      const resolvedThumb = await safeThumb(videoPath, first.videoOffsetMs!, startMs, thumbPath)
      clipStore.update(tempRecord.id, { path: clipPath, thumbPath: resolvedThumb })
      extractedClipIds.push(tempRecord.id)
      const label = trigger === 'ace' ? 'Ace' : `${killCount}K`
      logActivity(`${label} clip saved (late extract) — Round ${round + 1} (${map ?? 'unknown'})`)
    } catch (err) {
      log.warn(`[LateClipExtract] ${trigger} clip failed:`, err)
      reportError({ message: `[LateClipExtract] ${trigger} clip failed: ${(err as Error)?.message}`, stack: (err as Error)?.stack, component: 'desktop:LateClipExtract' })
    }
  }

  // Clutch clips
  for (const round of clutchRounds) {
    const clutchKills = timeline.playerKills.filter(k => (k.round ?? -1) === round && k.videoOffsetMs != null)
    if (clutchKills.length === 0) continue
    const first = clutchKills.reduce((a, b) => a.videoOffsetMs! < b.videoOffsetMs! ? a : b)
    const last = clutchKills.reduce((a, b) => a.videoOffsetMs! > b.videoOffsetMs! ? a : b)
    const startMs = Math.max(0, first.videoOffsetMs! - 15_000)
    const durationMs = Math.min(last.videoOffsetMs! - first.videoOffsetMs! + 20_000, 120_000)
    try {
      const tempRecord = clipStore.add({ path: '', thumbPath: null, trigger: 'clutch', map, agent, durationSeconds: durationMs / 1000, round, killCount: clutchKills.length, analysisJobId })
      const clipPath = ClipExtractor.clipPath(tempRecord.id)
      const thumbPath = ClipExtractor.thumbPath(tempRecord.id)
      await clipExtractor.extract({ sourcePath: videoPath, startOffsetMs: startMs, durationMs, outputPath: clipPath })
      const resolvedThumb = await safeThumb(videoPath, first.videoOffsetMs!, startMs, thumbPath)
      clipStore.update(tempRecord.id, { path: clipPath, thumbPath: resolvedThumb })
      extractedClipIds.push(tempRecord.id)
      logActivity(`Clutch clip saved (late extract) — Round ${round + 1} (${map ?? 'unknown'})`)
    } catch (err) {
      log.warn('[LateClipExtract] Clutch clip failed:', err)
      reportError({ message: `[LateClipExtract] Clutch clip failed: ${(err as Error)?.message}`, stack: (err as Error)?.stack, component: 'desktop:LateClipExtract' })
    }
  }

  if (extractedClipIds.length > 0) {
    logActivity(`${extractedClipIds.length} late-extracted clip${extractedClipIds.length === 1 ? '' : 's'} saved`)
    mainWindow?.webContents.send('clips:new', extractedClipIds)
    if (lastMatchDiagnostic) lastMatchDiagnostic.clipsExtracted += extractedClipIds.length
    if (Notification.isSupported()) {
      new Notification({
        title: 'UpForge — Clips Ready',
        body: `${extractedClipIds.length} highlight clip${extractedClipIds.length === 1 ? '' : 's'} saved from your match!`,
        silent: notifySilent(),
      }).show()
    }
  }
}

/**
 * Extract highlight clips from a completed match recording.
 * Called post-match once the recording file is finalised.
 */
/** Extract a thumbnail without aborting clip save on failure.
 *  Falls back to the clip start offset if the original seek is out-of-range. */
async function safeThumb(
  sourcePath: string,
  offsetMs: number,
  fallbackMs: number,
  outputPath: string,
): Promise<string | null> {
  for (const ms of [offsetMs, fallbackMs]) {
    try {
      await clipExtractor.thumbnail({ sourcePath, offsetMs: ms, outputPath })
      return outputPath
    } catch {
      // try next offset
    }
  }
  log.warn('[ClipExtract] Thumbnail skipped — all seek offsets failed:', outputPath)
  return null
}

async function extractMatchClips(
  videoPath: string,
  timeline: MatchData | null,
  analysisJobId: string | null
): Promise<void> {
  if (!fs.existsSync(videoPath)) {
    log.warn('[ClipExtract] Source video not found — skipping clip extraction:', videoPath)
    logActivity('Clip extraction skipped — recording file not found')
    return
  }

  const recordingStart = currentRecordingStartTime ?? 0
  const map = timeline?.map ?? null
  const agent = timeline?.agent ?? null
  const extractedClipIds: string[] = []

  // Log kill videoOffsetMs values for diagnostics
  if (timeline?.playerKills && timeline.playerKills.length > 0) {
    const sample = timeline.playerKills.slice(0, 5).map(k =>
      `R${(k.round ?? -1) + 1}@${k.videoOffsetMs != null ? `${(k.videoOffsetMs / 1000).toFixed(1)}s` : 'null'}`
    ).join(', ')
    log.info(`[ClipExtract] kills=${timeline.playerKills.length} first5_offsets=[${sample}] videoPath=${videoPath}`)
  }

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
      const resolvedThumb = await safeThumb(videoPath, offsetMs, startMs, thumbPath)
      clipStore.update(tempRecord.id, { path: clipPath, thumbPath: resolvedThumb })
      extractedClipIds.push(tempRecord.id)
      logActivity(`Saved hotkey clip (${map ?? 'unknown map'})`)
    } catch (err) {
      log.warn('[ClipExtract] Hotkey clip failed:', err)
      reportError({ message: `[ClipExtract] Hotkey clip failed: ${(err as Error)?.message}`, stack: (err as Error)?.stack, component: 'desktop:ClipExtract' })
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
        const resolvedThumb = await safeThumb(videoPath, offsetMs, startMs, thumbPath)
        clipStore.update(tempRecord.id, { path: clipPath, thumbPath: resolvedThumb })
        extractedClipIds.push(tempRecord.id)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        log.warn('[ClipExtract] Kill clip failed:', msg)
        logActivity(`Clip extraction error (kill): ${msg.slice(0, 120)}`)
        reportError({ message: `[ClipExtract] Kill clip failed: ${msg}`, stack: (err as Error)?.stack, component: 'desktop:ClipExtract' })
      }
    }

    // Combined clips: ace (5k+), 4k, 3k
    for (const [round, { kills: roundKills, trigger, killCount }] of combinedRounds.entries()) {
      const validKills = roundKills.filter(k => k.videoOffsetMs != null)
      if (validKills.length === 0) continue
      const first = validKills.reduce((a, b) => a.videoOffsetMs! < b.videoOffsetMs! ? a : b)
      const last = validKills.reduce((a, b) => a.videoOffsetMs! > b.videoOffsetMs! ? a : b)
      // Larger pre/post buffers for multi-kill sequences: some kills may be detected
      // slightly out-of-order or at the boundary of the valid window.
      // Ace: 10s pre-buffer, 20s post-buffer. 4k/3k: 8s pre, 18s post.
      const preBuffer = trigger === 'ace' ? 10_000 : 8_000
      const postBuffer = trigger === 'ace' ? 20_000 : 18_000
      const startMs = Math.max(0, first.videoOffsetMs! - preBuffer)
      const durationMs = Math.min(last.videoOffsetMs! - first.videoOffsetMs! + postBuffer, 120_000)
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
        const resolvedThumb = await safeThumb(videoPath, first.videoOffsetMs!, startMs, thumbPath)
        clipStore.update(tempRecord.id, { path: clipPath, thumbPath: resolvedThumb })
        extractedClipIds.push(tempRecord.id)
        const label = trigger === 'ace' ? 'Ace' : `${killCount}K`
        logActivity(`${label} clip saved — Round ${round + 1} (${map ?? 'unknown'})`)
      } catch (err) {
        log.warn(`[ClipExtract] ${trigger} clip failed:`, err)
        reportError({ message: `[ClipExtract] ${trigger} clip failed: ${(err as Error)?.message}`, stack: (err as Error)?.stack, component: 'desktop:ClipExtract' })
      }
    }

    // Clutch clips — 15s buffer before first kill to capture setup; 20s post-buffer
    for (const round of clutchRounds) {
      const clutchKills = timeline.playerKills.filter(k => (k.round ?? -1) === round && k.videoOffsetMs != null)
      if (clutchKills.length === 0) continue
      const first = clutchKills.reduce((a, b) => a.videoOffsetMs! < b.videoOffsetMs! ? a : b)
      const last = clutchKills.reduce((a, b) => a.videoOffsetMs! > b.videoOffsetMs! ? a : b)
      const startMs = Math.max(0, first.videoOffsetMs! - 15_000)
      const durationMs = Math.min(last.videoOffsetMs! - first.videoOffsetMs! + 20_000, 120_000)
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
        const resolvedThumb = await safeThumb(videoPath, first.videoOffsetMs!, startMs, thumbPath)
        clipStore.update(tempRecord.id, { path: clipPath, thumbPath: resolvedThumb })
        extractedClipIds.push(tempRecord.id)
        logActivity(`Clutch clip saved — Round ${round + 1} (${map ?? 'unknown'})`)
      } catch (err) {
        log.warn('[ClipExtract] Clutch clip failed:', err)
        reportError({ message: `[ClipExtract] Clutch clip failed: ${(err as Error)?.message}`, stack: (err as Error)?.stack, component: 'desktop:ClipExtract' })
      }
    }
  }

  if (extractedClipIds.length > 0) {
    logActivity(`${extractedClipIds.length} clip${extractedClipIds.length === 1 ? '' : 's'} saved from match`)
    mainWindow?.webContents.send('clips:new', extractedClipIds)
    if (lastMatchDiagnostic) lastMatchDiagnostic.clipsExtracted = extractedClipIds.length
    if (Notification.isSupported()) {
      new Notification({
        title: 'UpForge — Clips Ready',
        body: `${extractedClipIds.length} highlight clip${extractedClipIds.length === 1 ? '' : 's'} saved`,
        silent: notifySilent(),
      }).show()
    }
  } else {
    const killCount = timeline?.playerKills?.length ?? 0
    const hotkeyCount = hotkeyBookmarks.length
    if (killCount === 0 && hotkeyCount === 0) {
      logActivity('No clips extracted — no kills in timeline (MatchDetails may not be ready yet) and no hotkey bookmarks')
    } else if (killCount === 0) {
      logActivity('No kill clips extracted — no kills in timeline; hotkey clips may have been saved')
    } else {
      logActivity('No clips extracted — all kills lacked video timestamps')
    }
    log.info(`[ClipExtract] 0 clips produced — kills=${killCount} hotkeys=${hotkeyCount} timeline=${!!timeline}`)
  }

  // Reset bookmarks for next match
  hotkeyBookmarks.length = 0
  currentRecordingStartTime = null
}

/**
 * Fire-and-forget pre-game brief using the player's historical brain data.
 * Fetches the top weaknesses and agent/map recommendations and shows a
 * desktop notification so the player can mentally prepare before the match.
 * Optional agent and map context personalise the brief to the current match.
 */
function requestPregameBrief(context?: { agent?: string | null; map?: string | null; mode?: string | null }): void {
  if (!authManager.getToken()) {
    logActivity('Pre-game brief skipped — not logged in')
    return
  }

  const params = new URLSearchParams()
  if (context?.agent) params.set('agent', context.agent)
  if (context?.map) params.set('map', context.map)
  params.set('t', Date.now().toString())
  const url = `https://upforge.gg/valorant/pregame-brief?${params.toString()}`

  shell.openExternal(url)
  logActivity('Pre-game brief: opened in browser')
}

/**
 * Fire-and-forget post-game debrief using Riot Live Client match data.
 * Calls the Laravel /api/desktop-submissions/debrief endpoint which proxies to
 * the AI service for a quick Claude round-by-round coaching breakdown.
 * Sends the result to the post-game window via 'post-game:debrief'.
 */
async function requestPostGameDebrief(opts: {
  riotName: string
  riotTag: string
  agent: string | null
  map: string | null
  timeline: MatchData
  sendToWindow: (channel: string, payload?: unknown) => void
}): Promise<void> {
  const { riotName, riotTag, agent, map, timeline, sendToWindow } = opts
  const token = authManager.getToken()
  if (!token) return

  const apiUrl = process.env['VITE_API_URL'] || 'https://api.upforge.gg'

  const body = JSON.stringify({
    riot_name: riotName,
    riot_tag:  riotTag,
    agent,
    map,
    match_data: timeline,
  })

  const parsedUrl = new URL(`${apiUrl}/api/desktop-submissions/debrief`)
  const proto = parsedUrl.protocol === 'https:' ? await import('https') : await import('http')

  return new Promise((resolve) => {
    const req = proto.default.request({
      method:   'POST',
      hostname: parsedUrl.hostname,
      port:     parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path:     parsedUrl.pathname,
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Authorization':  `Bearer ${token}`,
        'Accept':         'application/json',
      },
    }, (res) => {
      let data = ''
      res.on('data', (c) => { data += c })
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          if ((res.statusCode ?? 0) >= 400) {
            const errMsg = json.message ?? json.error ?? `HTTP ${res.statusCode}`
            log.warn('[Debrief] API error:', res.statusCode, errMsg)
            reportError({ message: `[Debrief] API error ${res.statusCode}: ${errMsg}`, component: 'desktop:Debrief', extra: { statusCode: res.statusCode } })
            sendToWindow('post-game:debrief', null)
          } else {
            log.info(`[Debrief] Generated for ${riotName}#${riotTag} cost=$${json.estimated_cost_usd ?? 0}`)
            sendToWindow('post-game:debrief', {
              debrief: json.debrief_text,
              agent,
              map,
              discordLinked: json.discord_linked ?? false,
            })
          }
        } catch {
          log.warn('[Debrief] Non-JSON response:', data.slice(0, 200))
          sendToWindow('post-game:debrief', null)
        }
        resolve()
      })
    })
    req.on('error', (err) => {
      log.warn('[Debrief] Request error:', err.message)
      reportError({ message: `[Debrief] Request error: ${err.message}`, stack: err.stack, component: 'desktop:Debrief' })
      sendToWindow('post-game:debrief', null)
      resolve()
    })
    req.setTimeout(120_000, () => {
      req.destroy(new Error('Debrief request timed out after 120s'))
    })
    req.write(body)
    req.end()
  })
}

function createMainWindow(startAuthenticated: boolean = false): BrowserWindow {
  const win = new BrowserWindow({
    width: startAuthenticated ? 1280 : 860,
    height: startAuthenticated ? 800 : 580,
    minWidth: 980,
    minHeight: 660,
    resizable: true,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0a0f1c',
    icon: join(__dirname, '../../resources/icon.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
  })

  win.on('ready-to-show', () => {
    win.show()
    if (startAuthenticated) win.maximize()
  })

  let rendererCrashCount = 0
  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('[Main] Renderer process gone:', details.reason)
    if (details.reason !== 'clean-exit') {
      rendererCrashCount++
      if (rendererCrashCount > 3) {
        console.error('[Main] Renderer crashed too many times — not reloading to prevent loop')
        return
      }
      const delay = Math.min(1000 * Math.pow(2, rendererCrashCount - 1), 15_000)
      console.warn(`[Main] Reloading renderer (attempt ${rendererCrashCount}/3) in ${delay}ms`)
      setTimeout(() => {
        try {
          if (!win.isDestroyed()) {
            if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
              win.loadURL(process.env['ELECTRON_RENDERER_URL'])
            } else {
              win.loadFile(join(__dirname, '../renderer/index.html'))
            }
            // Reset crash counter on successful reload
            win.webContents.once('did-finish-load', () => { rendererCrashCount = 0 })
          }
        } catch (e) {
          console.error('[Main] Failed to reload renderer:', e)
        }
      }, delay)
    }
  })
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
    skipTaskbar: false,
    backgroundColor: '#0a0f1c',
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
        label: 'Open Clips Folder',
        click: () => shell.openPath(ClipExtractor.clipsDir())
      },
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

  tray.setToolTip('UpForge — AI Coaching')
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
    const recordingDuration = currentActiveRecorder.getRecordingDuration()
    const matchSessionStart = currentRecordingStartTime ?? (Date.now() - recordingDuration * 1000)
    await currentActiveRecorder.stop()

    const videoPath = currentActiveRecorder.getLastRecordingPath()
    const fileSize = currentActiveRecorder.getLastRecordingSize()
    const user = authManager.getUser()
    const map = timeline?.map ?? null
    const agent = timeline?.agent ?? null
    const gameMode = riotLocalApi.getLastGameMode() ?? 'UNKNOWN'
    const config = settingsManager?.get()
    const autoAnalyse = config?.autoAnalyse !== false

    // Capture diagnostic state for the developer panel
    const riotDiag = riotLocalApi.getDiagnostics()
    const killsInTimeline = timeline?.playerKills?.length ?? 0
    lastMatchDiagnostic = {
      timestamp: Date.now(),
      matchId: timeline?.matchId ?? null,
      map,
      agent,
      gameMode,
      recordingDuration,
      fileSizeMb: fileSize / (1024 * 1024),
      killsInTimeline,
      clipsExtracted: 0, // updated after extractMatchClips completes
      matchDetailsStatus: timeline?.matchId
        ? (killsInTimeline > 0 ? 'fetched' : (riotDiag.region ? 'fetch_failed' : 'no_region'))
        : (riotDiag.accessTokenPresent ? 'no_match_id' : 'no_auth'),
    }

    log.info(
      `[HandleMatchEnd] duration=${recordingDuration}s videoPath=${videoPath} fileSize=${fileSize} ` +
      `kills=${timeline?.playerKills?.length ?? 0} matchId=${timeline?.matchId ?? 'none'}`
    )

    tray?.setToolTip(idleTooltip(game))

    const MIN_DURATION_SECONDS = 120
    const MIN_FILE_SIZE_BYTES = 1024 * 1024
    // Full competitive recordings can reach ~3 GB — allow up to 4 GB
    const MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024 * 1024

    if (recordingDuration > 0 && recordingDuration < MIN_DURATION_SECONDS) {
      console.log(`[GameDetector] Recording too short (${recordingDuration}s) — ignoring`)
      logActivity(`Recording too short (${recordingDuration}s) — discarded`)
      if (videoPath && fs.existsSync(videoPath)) {
        try { fs.unlinkSync(videoPath) } catch { /* ignore */ }
      }
      return
    }

    // If recording never started (currentActiveRecorder.start() threw earlier in this match),
    // skip the post-game window — it would just show a confusing error.
    if (recordingDuration === 0) {
      const lastErr = currentActiveRecorder.getLastError()
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
    // Flash the taskbar button so the user knows it's there even if Valorant
    // is still covering the screen (only stops flashing when user focuses it).
    thisPostGameWindow.flashFrame(true)
    thisPostGameWindow.once('focus', () => thisPostGameWindow.flashFrame(false))

    // Fire post-game debrief in the background — non-blocking. Uses Riot Live Client
    // match data (kills, rounds, stats) for instant Claude coaching without needing the VOD.
    // Only runs for competitive/premier matches where meaningful data was captured.
    const hasMatchData = timeline && (
      (timeline.playerKills?.length ?? 0) > 0
      || (timeline.roundScores?.length ?? 0) > 0
      || timeline.finalStats != null
    )
    const isRankedMode = ['COMPETITIVE', 'PREMIER'].includes(gameMode?.toUpperCase() ?? '')
    if (hasMatchData && isRankedMode && user?.riot_name) {
      requestPostGameDebrief({
        riotName: user.riot_name,
        riotTag: user.riot_tag ?? 'NA1',
        agent,
        map,
        timeline,
        sendToWindow: (channel, payload) => {
          if (!thisPostGameWindow.isDestroyed()) thisPostGameWindow.webContents.send(channel, payload)
        },
      }).catch(err => log.warn('[Debrief] Background debrief failed:', err))
    }

    // Notify the user that the match recording has finished and upload is starting
    if (Notification.isSupported()) {
      const agentLabel = agent ?? gameLabel(game)
      const mapLabel = map ? ` on ${map}` : ''
      new Notification({
        title: 'UpForge — Recording Complete',
        body: `${agentLabel}${mapLabel} — uploading for AI analysis…`
      }).show()
    }

    // CS2 demo auto-pull — runs asynchronously and never blocks the main upload flow
    if (game === 'cs2') {
      ;(async () => {
        try {
          const cs2DemoDir = settingsManager?.get().cs2DemoDir
          log.info(`[CS2Demo] Match ended — searching for demo (startTime=${matchSessionStart}, dir=${cs2DemoDir ?? 'auto'})`)

          const sendToWindow = (channel: string, payload?: unknown) => {
            if (!thisPostGameWindow.isDestroyed()) thisPostGameWindow.webContents.send(channel, payload)
          }

          const demoResult = await findLatestCS2Demo(matchSessionStart, cs2DemoDir)

          if (!demoResult.found || !demoResult.demoPath) {
            log.info('[CS2Demo] No demo found — user may need cl_demo_auto_recording 1')
            sendToWindow('post-game:demo-status', { status: 'not-found' })
            return
          }

          const { demoPath } = demoResult
          log.info(`[CS2Demo] Demo found: ${demoPath} — starting upload`)
          sendToWindow('post-game:demo-status', { status: 'uploading', path: demoPath })

          const uploader = new CS2DemoUploader(authManager)
          const { jobId } = await uploader.upload({
            demoPath,
            steamId: null,
            onProgress: (pct) => sendToWindow('post-game:demo-progress', pct),
          })

          log.info(`[CS2Demo] Upload complete — jobId=${jobId}, starting poll`)
          sendToWindow('post-game:demo-status', { status: 'analysing', jobId })

          // Poll every 10s with exponential backoff up to 30s, for up to 10 minutes
          const MAX_POLL_MS = 10 * 60 * 1000
          const pollStart = Date.now()
          let interval = 10_000

          while (Date.now() - pollStart < MAX_POLL_MS) {
            await new Promise<void>((r) => setTimeout(r, interval))
            interval = Math.min(interval * 1.5, 30_000)

            try {
              const { status, error } = await uploader.pollStatus(jobId)
              log.info(`[CS2Demo] Poll status=${status}`)

              if (status === 'completed') {
                log.info(`[CS2Demo] Analysis complete — jobId=${jobId}`)
                sendToWindow('post-game:demo-status', { status: 'complete', jobId })
                return
              }
              if (status === 'failed') {
                log.warn(`[CS2Demo] Analysis failed — jobId=${jobId} error=${error}`)
                sendToWindow('post-game:demo-status', { status: 'error', error: error ?? 'Analysis failed' })
                return
              }
            } catch (pollErr) {
              log.warn('[CS2Demo] Poll error (non-fatal):', pollErr)
            }
          }

          log.warn(`[CS2Demo] Polling timed out after 10 minutes — jobId=${jobId}`)
        } catch (err) {
          log.warn('[CS2Demo] Demo upload flow error:', err)
          try {
            if (!thisPostGameWindow.isDestroyed()) {
              thisPostGameWindow.webContents.send('post-game:demo-status', { status: 'error', error: 'Demo upload failed' })
            }
          } catch { /* window may already be closed */ }
        }
      })().catch(() => { /* swallow — never propagate to caller */ })
    }

    // Guard: window may be destroyed before it finishes loading (e.g. user closes it immediately).
    if (thisPostGameWindow.isDestroyed()) return
    try {
      thisPostGameWindow.webContents.once('did-finish-load', async () => {
        if (thisPostGameWindow.isDestroyed()) return
        const sendToWindow = (channel: string, payload?: unknown) => {
          try {
            if (!thisPostGameWindow.isDestroyed()) thisPostGameWindow.webContents.send(channel, payload)
          } catch { /* destroyed between check and send */ }
        }

      if (!videoPath || !fs.existsSync(videoPath)) {
        const ffmpegError = currentActiveRecorder.getLastError()
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

      if (fileSize > MAX_FILE_SIZE_BYTES) {
        const sizeGB = (fileSize / (1024 * 1024 * 1024)).toFixed(1)
        const errorMsg = `Recording is too large (${sizeGB} GB). Maximum supported size is 4 GB. Try lowering your recording quality or resolution in Settings.`
        log.warn(`[GameDetector] Recording too large to analyse: ${sizeGB} GB`)
        logActivity(`Recording too large (${sizeGB} GB) — analysis skipped`)
        sendToWindow('post-game:upload-error', errorMsg)
        return
      }

      // Shared clip extraction logic — runs regardless of autoAnalyse.
      // Clips (3k/4k/ace/clutch/hotkey) are always extracted from every recording.
      const matchId = timeline?.matchId
      const hasKills = (timeline?.playerKills?.length ?? 0) > 0
      const lateRetryScheduled = !hasKills && !!matchId

      const doAutoDelete = () => {
        if (settingsManager?.get().autoDelete) {
          log.info('[App] Auto-deleting recording after clip extraction:', videoPath)
          currentActiveRecorder.deleteRecording(videoPath)
        }
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

        // Extract all highlight clips even without auto-analyse — 3k/4k/ace/clutch/hotkey.
        // Do NOT auto-delete here: the user hasn't analysed yet (autoAnalyse=false).
        // Deletion is deferred until after manual analysis via doUploadAndAnalyse.
        extractMatchClips(videoPath, timeline, null)
          .catch(err => log.warn('[ClipExtract] Clip extraction (no-analyse) error:', err))

        // Late retry for when Riot match data isn't ready yet (same logic as autoAnalyse path)
        if (lateRetryScheduled) {
          log.info('[HandleMatchEnd] No kills (no-analyse) — scheduling late retry in 90s')
          setTimeout(async () => {
            try {
              log.info('[LateClipExtract] Fetching match details for', matchId)
              const details = await riotLocalApi.fetchMatchDetailsLate(matchId)
              if (!details) { log.warn('[LateClipExtract] Match details still unavailable'); return }
              if (timeline) {
                // Set matchDetails BEFORE populateMatchDataFromDetails so detectClutchRounds works
                timeline.matchDetails = details
                riotLocalApi.populateMatchDataFromDetails(timeline, details)
              }
              if ((timeline?.playerKills?.length ?? 0) === 0) { log.warn('[LateClipExtract] No kills after retry'); return }
              log.info(`[LateClipExtract] Got ${timeline!.playerKills.length} kills — extracting clips`)
              await extractKillClipsOnly(videoPath, timeline!, null)
            } catch (err) {
              log.warn('[LateClipExtract] Error (no-analyse path):', err)
            }
            // Do NOT auto-delete: user has autoAnalyse=false so they intend to
            // manually analyse this recording. Deletion happens in doUploadAndAnalyse.
          }, 90_000)
        }
        return
      }

      tray?.setToolTip('UpForge — Uploading...')

      // Always save to the recordings store so the recording appears in the dashboard
      // and can be retried if upload fails. In the auto-analyse path this was previously
      // only saved on upload failure, meaning a successful upload + auto-delete left
      // the user with no trace of the recording.
      const autoAnalyseRecording = recordingsStore.add({
        path: videoPath,
        riotName: user?.riot_name ?? '',
        riotTag: user?.riot_tag ?? '',
        game,
        map,
        agent,
        gameMode,
        timeline
      })
      mainWindow?.webContents.send('recordings:updated')

      const uploadResult = await doUploadAndAnalyse(autoAnalyseRecording.id, videoPath, user?.riot_name ?? '', user?.riot_tag ?? '',
        game, map, agent, timeline, thisPostGameWindow, matchSessionStart, /* skipAutoDelete= */ true)

      const jobId = uploadResult ?? null

      // Extract highlight clips from the recording in the background (non-blocking).
      // Auto-delete is deferred to run AFTER clip extraction so the file is available.
      extractMatchClips(videoPath, timeline, jobId)
        .catch(err => log.warn('[ClipExtract] Background extraction error:', err))
        .finally(() => {
          // Defer auto-delete until after the late retry so the video file still exists
          if (!lateRetryScheduled) doAutoDelete()
        })

      // If Riot hasn't processed the match yet (no kills in timeline), retry match details
      // after a delay — Riot typically takes 1-3 minutes to publish match data.
      if (lateRetryScheduled) {
        log.info('[HandleMatchEnd] No kills in timeline — scheduling late match details retry in 90s (auto-delete deferred)')
        setTimeout(async () => {
          try {
            log.info('[LateClipExtract] Fetching match details for', matchId)
            const details = await riotLocalApi.fetchMatchDetailsLate(matchId)
            if (!details) {
              log.warn('[LateClipExtract] Match details still unavailable after delay')
              return
            }
            // Set matchDetails BEFORE populateMatchDataFromDetails so detectClutchRounds works
            if (timeline) timeline.matchDetails = details
            if (timeline) riotLocalApi.populateMatchDataFromDetails(timeline, details)
            if ((timeline?.playerKills?.length ?? 0) === 0) {
              log.warn('[LateClipExtract] Match details fetched but no kills found for this player')
              return
            }
            log.info(`[LateClipExtract] Got ${timeline!.playerKills.length} kills — extracting clips`)
            await extractKillClipsOnly(videoPath, timeline!, jobId)
          } catch (err) {
            log.warn('[LateClipExtract] Error:', err)
          } finally {
            doAutoDelete()
          }
        }, 90_000)
      }
      })
    } catch (err) {
      log.warn('[HandleMatchEnd] Failed to register did-finish-load handler — window already destroyed:', err)
    }
  }

  gameDetector.on('game-started', async (game: string) => {
    console.log(`[GameDetector] ${game} started`)
    logActivity(`${game === 'cs2' ? 'CS2' : 'Valorant'} detected — waiting for match`)
    discordRPC.setInGame(game)

    // Minimize the main window while gaming to reduce Chromium GPU/CPU overhead.
    // The user can restore it from the taskbar or tray if needed.
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
      mainWindow.minimize()
    }

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
      fps: config.recordingFps,
      audioEnabled: config.audioEnabled,
      savePath: config.savePath,
      captureMonitor: config.captureMonitor,
    } : undefined

    // Check disk space now so the warning shows while in lobby
    const savePath = config?.savePath ?? app.getPath('userData')
    // Determine the recorder to use for this match now (OBS if enabled & connected, else DesktopRecorder)
    currentActiveRecorder = activeRecorder()
    const freeBytes = await currentActiveRecorder.getFreeDiskSpace(savePath)
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

    // Pre-game brief: fetch agent+map context from the Riot pregame API (available during
    // loading screen) and show a personalised coaching notification.
    // Falls back to a generic brief if the Riot Local API is not reachable.
    let pregameBriefFired = false

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
        await new Promise((r) => setTimeout(r, 1000))
        if (cancelled) break
        const stillRunning = await gameDetector.isMatchProcessRunning()
        if (!stillRunning) { cancelled = true; break }
        try {
          const state = await riotLocalApi.getSessionState()

          // Resolve game mode from presence queueId (quick, available early)
          if (!gameMode && state?.queueId) {
            const { normalizeQueueId } = await import('./riot-local-api')
            gameMode = normalizeQueueId(state.queueId)
          }

          // Pre-game brief is only useful for competitive/premier matches.
          // Wait until mode is confirmed — do NOT default to true when unknown,
          // as that's what was causing the brief to fire for all queues.
          const modeKnown = gameMode !== null
          const isCompBrief = gameMode === 'COMPETITIVE' || gameMode === 'PREMIER'

          // Brief: once PREGAME starts, poll until the agent is locked in (CharacterID
          // is only set after lock-in). Fire as soon as we have agent+map, or fall back
          // to map-only/generic when INGAME is reached (loading screen).
          if (!pregameBriefFired && state?.sessionLoopState === 'PREGAME') {
            const ctx = await riotLocalApi.getPregameContext().catch(() => null)

            // Use QueueID from the pregame match endpoint as the definitive source
            if (ctx?.mode && !gameMode) {
              gameMode = ctx.mode
            }

            const resolvedIsComp = gameMode === 'COMPETITIVE' || gameMode === 'PREMIER'

            if (!resolvedIsComp && gameMode !== null) {
              // Non-competitive queue confirmed — skip brief
              pregameBriefFired = true
            } else if (resolvedIsComp && ctx?.agent) {
              // Competitive + agent locked in — fire with full context
              pregameBriefFired = true
              requestPregameBrief(ctx)
            }
            // else: mode not yet known or agent not locked — keep looping, try again next tick
          }

          if (!pregameBriefFired && state?.sessionLoopState === 'INGAME') {
            if (!modeKnown || isCompBrief) {
              // Competitive (or mode never resolved) — fire fallback brief
              pregameBriefFired = true
              riotLocalApi.getPregameContext()
                .then(ctx => requestPregameBrief(ctx ?? undefined))
                .catch(() => requestPregameBrief())
            } else {
              // Non-competitive confirmed — suppress brief
              pregameBriefFired = true
            }
          }

          if (state?.sessionLoopState === 'INGAME') {
            // Replay viewer shows INGAME presence — do not record replays
            if (state.isReplay) {
              console.log('[GameDetector] Replay detected (provisioningFlow=Replay) — skipping recording')
              logActivity('Replay detected — recording skipped')
              tray?.setToolTip(idleTooltip(game))
              waitingForMatch = false
              cancelMatchWait = null
              mainWindow?.webContents.send('recording:waiting-for-match', { waiting: false })
              // Re-arm detection so we catch the next real match
              await new Promise((r) => setTimeout(r, 5000))
              if (await gameDetector.isMatchProcessRunning()) {
                gameDetector.emit('game-started', game)
              }
              return
            }
            matchStartTime = Date.now()
            if (state.queueId) {
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
      // Fire generic brief immediately when auth is unavailable
      requestPregameBrief()
      pregameBriefFired = true
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
      tray?.setToolTip(idleTooltip(game))
      return
    }

    // If presence API was available but INGAME was never seen, the player is idle
    // in the lobby (or queued and cancelled). Do NOT start recording — this is what
    // causes "hallucinated" matches when the app is left idle for 25+ minutes.
    if (authOk && matchStartTime === null) {
      logActivity('Presence timeout — no match started, returning to idle')
      console.log('[GameDetector] Presence loop timed out without INGAME — not recording')
      tray?.setToolTip(idleTooltip(game))
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
      tray?.setToolTip(idleTooltip(game))
      // Valorant stays running between matches — re-arm detection once the skipped match ends.
      // Without this, no new 'game-started' event fires and all subsequent matches are missed.
      if (game === 'valorant') {
        riotLocalApi.onMatchEnded = async () => {
          riotLocalApi.onMatchEnded = null
          await new Promise((r) => setTimeout(r, 5000))
          if (await gameDetector.isMatchProcessRunning()) {
            console.log('[GameDetector] Game still running after skipped match — re-arming detection')
            logActivity('Watching for next match...')
            gameDetector.emit('game-started', game)
          }
        }
      }
      return
    }

    if (!gameMode) gameMode = 'COMPETITIVE'
    matchActive = true
    matchHandled = false

    logActivity(`Match detected (${gameMode}${modeConfident ? '' : '?'}) — starting recording`)
    console.log(`[GameDetector] Match confirmed! gameMode=${gameMode} confident=${modeConfident} matchStartTime=${matchStartTime}`)

    // Wire up onMatchEnded — fires when Riot presence transitions INGAME → MENUS.
    // Only applicable to Valorant; CS2/Deadlock rely on the game process exiting.
    if (game === 'valorant') {
      riotLocalApi.onMatchEnded = async () => {
        if (matchHandled) return
        matchHandled = true
        console.log('[RiotLocalApi] onMatchEnded fired — stopping recording')
        logActivity('Match ended (presence) — stopping recording')
        await handleMatchEnd(game)
        // Restore main window and tear down the overlay now that the match is over.
        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isMinimized()) mainWindow.restore()
        destroyOverlay()

        // VALORANT-Win64-Shipping.exe often stays alive between consecutive matches.
        // Re-enter the full detection loop if the process is still running.
        await new Promise((r) => setTimeout(r, 5000))
        if (await gameDetector.isMatchProcessRunning()) {
          console.log('[GameDetector] Game still running after match — watching for next match')
          logActivity('Watching for next match...')
          gameDetector.emit('game-started', game)
        }
      }

      // Start Riot local API tracking (kill/round events, match ID, post-match details)
      riotLocalApi.start(game, matchStartTime ?? undefined)
    }

    tray?.setToolTip('UpForge — Starting recorder...')
    mainWindow?.webContents.send('recording:starting', { starting: true })
    try {
      // Create the overlay window just before recording starts — deferred from startup
      // so it doesn't break Valorant's exclusive fullscreen before we actually need it.
      createOverlayWindow()
      // Notify if OBS was enabled but not connected — we fell back to desktop capture
      if (settingsManager?.get().obsEnabled && !(currentActiveRecorder instanceof OBSRecorder)) {
        mainWindow?.webContents.send('app:warning', { message: 'OBS is not connected — recording with desktop capture instead' })
        if (Notification.isSupported()) {
          new Notification({
            title: 'UpForge — OBS Not Connected',
            body: 'Falling back to desktop capture. Connect OBS WebSocket in Settings.',
            silent: notifySilent()
          }).show()
        }
      }
      await currentActiveRecorder.start(game, recorderConfig)
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
          silent: notifySilent()
        }).show()
      }
      // Reset tray tooltip after 10 seconds so it doesn't stay on "failed"
      setTimeout(() => tray?.setToolTip(idleTooltip(game)), 10_000)
      return
    }
    logActivity(`Recording started (${gameMode ?? 'unknown mode'}${currentActiveRecorder.wasNoAudio() ? ' — no audio' : ''})`)

    // Start polling session state to feed the live overlay with round data.
    // The first time we see INGAME, record the timestamp as the true gameplay start —
    // this is used instead of the INGAME presence time (which fires during loading screen)
    // to compute accurate videoOffsetMs for clip seeking.
    overlayPollTimer = setInterval(async () => {
      try {
        const state = await riotLocalApi.getSessionState()
        if (state?.sessionLoopState === 'INGAME') {
          // Capture gameplay start time on first INGAME poll (loading screen is over)
          riotLocalApi.setGameplayStartTime(Date.now())
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

    if (currentActiveRecorder.wasNoAudio()) {
      mainWindow?.webContents.send('app:warning', {
        message: 'Recording started without audio — your system audio device was unavailable'
      })
    }

    const startupWarning = recorder.getStartupWarning()
    if (startupWarning) {
      mainWindow?.webContents.send('app:warning', { message: startupWarning })
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
        silent: notifySilent()
      }).show()
    }
  })

  gameDetector.on('game-stopped', async (game: string) => {
    console.log(`[GameDetector] ${game} stopped`)
    discordRPC.setIdle()

    // Game quit while still in lobby (before match started)
    if (cancelMatchWait) {
      cancelMatchWait()
      cancelMatchWait = null
      waitingForMatch = false
      mainWindow?.webContents.send('recording:waiting-for-match', { waiting: false })
      tray?.setToolTip(idleTooltip(game))
      console.log('[GameDetector] Game quit before match — no recording to save')
      logActivity('Game quit before match started — nothing recorded')
      // Restore main window now that game is gone
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isMinimized()) mainWindow.restore()
      destroyOverlay()
      return
    }

    // Presence already fired onMatchEnded and the match was handled — nothing to do
    if (matchHandled) {
      console.log('[GameDetector] Match already handled by onMatchEnded — skipping game-stopped')
      riotLocalApi.onMatchEnded = null
      // Restore main window now that game is gone
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isMinimized()) mainWindow.restore()
      destroyOverlay()
      return
    }

    // Process died without a clean presence transition (crash, force-quit, etc.)
    matchHandled = true
    if (overlayPollTimer) { clearInterval(overlayPollTimer); overlayPollTimer = null }
    sendOverlayData('overlay:data', { round: null, allyScore: null, enemyScore: null, yourCredits: null, enemyEstimate: null, recording: false })
    logActivity('Game process ended — stopping recording')
    await handleMatchEnd(game)
    // Restore main window now that game is gone
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isMinimized()) mainWindow.restore()
    destroyOverlay()
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
  const { agent = null, map = null, game = 'valorant' } = context
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
        tray?.setToolTip(idleTooltip(game))
        if (Notification.isSupported()) {
          const notifAgent = agent ?? gameLabel(game)
          const notifMap = map ? ` on ${map}` : ''
          const notifScore = score != null ? ` — Score: ${score}/100` : ''
          new Notification({
            title: 'UpForge — Analysis Ready',
            body: `${notifAgent}${notifMap}${notifScore}`,
            silent: notifySilent()
          }).show()
        }
      } else if (status.status === 'failed') {
        const errorMsg = status.error || 'Your previous analysis failed.'
        logActivity(`Resumed analysis failed: ${errorMsg}`)
        clearPendingJob()
        tray?.setToolTip(idleTooltip(game))
        if (Notification.isSupported()) {
          new Notification({
            title: 'UpForge — Analysis Failed',
            body: errorMsg.length > 100 ? errorMsg.slice(0, 97) + '…' : errorMsg,
            silent: notifySilent()
          }).show()
        }
        mainWindow?.webContents.send('dashboard:refresh')
      } else if (Date.now() - startTime > 600_000) {
        logActivity('Resumed analysis poll timed out after 10 minutes')
        clearPendingJob()
        tray?.setToolTip(idleTooltip(game))
      } else {
        schedulePoll()
      }
    } catch (pollErr) {
      pollFailCount++
      if (pollFailCount >= 5) {
        logActivity('Resumed poll — lost connection to server')
        clearPendingJob()
        tray?.setToolTip(idleTooltip(game))
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
  sessionStart = 0,
  skipAutoDelete = false
): Promise<string | null> {
  const send = (channel: string, payload?: unknown) => {
    try {
      if (!targetWindow.isDestroyed()) targetWindow.webContents.send(channel, payload)
    } catch { /* destroyed between isDestroyed check and send */ }
  }
  try {
    send('post-game:upload-start', {
      game,
      map,
      agent,
      matchDetailsStatus: lastMatchDiagnostic?.matchDetailsStatus ?? 'pending',
      killsInTimeline: lastMatchDiagnostic?.killsInTimeline ?? 0,
    })
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

    // Auto-delete after upload if configured (skip when called from handleMatchEnd —
    // deletion is deferred until after clip extraction so clips aren't skipped)
    if (!skipAutoDelete && settingsManager?.get().autoDelete) {
      log.info('[App] Auto-deleting recording after upload:', videoPath)
      currentActiveRecorder.deleteRecording(videoPath)
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
            verdict: (status.result as Record<string, unknown>).verdict ?? null,
            coaching_tags: (status.result as Record<string, unknown>).coaching_tags ?? [],
            session_start: sessionStart,
            kills: timeline?.finalStats?.kills ?? null,
            deaths: timeline?.finalStats?.deaths ?? null,
            assists: timeline?.finalStats?.assists ?? null,
            match_result: matchResult,
            ally_score: lastScore?.allyScore ?? null,
            enemy_score: lastScore?.enemyScore ?? null,
          })
          mainWindow?.webContents.send('dashboard:refresh')
          tray?.setToolTip(idleTooltip(game))
          const notifAgent = agent ?? gameLabel(game)
          const notifMap = map ? ` on ${map}` : ''
          const notifScore = score != null ? ` — Score: ${score}/100` : ''
          new Notification({
            title: 'UpForge — Analysis Ready',
            body: `${notifAgent}${notifMap}${notifScore}`,
            silent: notifySilent()
          }).show()
          // Flash the post-game window taskbar button to attract attention
          if (!targetWindow.isDestroyed()) {
            targetWindow.flashFrame(true)
            targetWindow.once('focus', () => targetWindow.flashFrame(false))
          }

          // Open the results page in the browser directly from the main process.
          // This fires even if the post-game window was closed before analysis completed.
          if (analysisId && settingsManager?.get()?.autoOpenBrowser !== false) {
            shell.openExternal(`https://upforge.gg/${game}/results/${analysisId}`)
          }
        } else if (status.status === 'failed') {
          const rawError = status.error || 'Analysis failed. Please try again.'
          // Sanitise raw internal errors into user-friendly messages
          const isTimeout = /timed? ?out|curl error 28|operation timed/i.test(rawError)
          const errorMsg = isTimeout ? 'Analysis timed out.' : rawError
          logActivity(`Analysis failed: ${rawError}`)
          clearPendingJob()
          send('post-game:upload-error', errorMsg)
          tray?.setToolTip(idleTooltip(game))
        } else if (Date.now() - startTime > 600_000) {
          logActivity('Analysis timed out')
          clearPendingJob()
          send('post-game:upload-error', 'Analysis timed out.')
          tray?.setToolTip(idleTooltip(game))
        } else {
          schedulePoll()
        }
      } catch (pollErr) {
        pollFailCount++
        console.warn(`[Upload] Poll error (${pollFailCount}):`, pollErr)
        if (pollFailCount >= 5) {
          logActivity('Analysis polling failed — lost connection to server')
          send('post-game:upload-error', 'Lost connection while waiting for analysis. Check your internet connection.')
          tray?.setToolTip(idleTooltip(game))
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
    tray?.setToolTip(idleTooltip(game))

    // Quota exceeded — send upgrade prompt (no retry makes sense here)
    const isUpgradeError = err instanceof UpgradeRequiredError
      || (err instanceof Error && err.name === 'UpgradeRequiredError')
      || (err instanceof Error && /analysis.limit.reached|upgrade.required/i.test(err.message))
    if (isUpgradeError) {
      const upgradeErr = err as UpgradeRequiredError
      send('post-game:upload-error', {
        message: msg,
        needsUpgrade: true,
        upgradeUrl: (upgradeErr.upgradeUrl) || 'https://upforge.gg/pricing',
      })
      return null
    }

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
    width: 680,
    height: 440,
    resizable: false,
    frame: false,
    center: true,
    skipTaskbar: false,
    backgroundColor: '#0a0f1c',
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

  // Intercepts getDisplayMedia() calls from the renderer so we can auto-select
  // the screen source without showing the OS picker, and so cursor:'never' in
  // the renderer's video constraints is honoured. The renderer signals which
  // source to use via 'desktop-capturer:set-source' before calling getDisplayMedia.
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const sourceId = consumePendingCaptureSourceId()
      // Only request screen sources — never window sources — so the fallback is always
      // a display capture, not an open app window (e.g. Chrome).
      const sources = await desktopCapturer.getSources({ types: ['screen'] })
      const source = (sourceId ? sources.find(s => s.id === sourceId) : null) ?? sources[0]
      if (sourceId && !sources.find(s => s.id === sourceId)) {
        log.warn('[App] setDisplayMediaRequestHandler: source ID not found, falling back to primary screen:', sourceId)
      }
      callback({ video: source ?? sources[0], audio: 'loopback' as const })
    } catch (err) {
      console.error('[App] setDisplayMediaRequestHandler error:', err)
      callback({})
    }
  }, { useSystemPicker: false })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // When a second instance is launched (e.g. user double-clicks the icon again),
  // bring the existing window to the front instead of opening another copy.
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    } else {
      // Window was destroyed (e.g. after a crash) — recreate it
      mainWindow = createMainWindow()
    }
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

  // When a 401 fires mid-session, tell the renderer to show the login screen
  authManager.onSessionExpired = () => {
    log.warn('[App] Session expired — notifying renderer')
    mainWindow?.webContents.send('auth:session-expired')
  }

  // Resume polling for any job_id that was persisted before a crash.
  // We wait until the main window is ready before sending the result.
  const orphanedJob = readPendingJob()
  if (orphanedJob) {
    console.log('[App] Orphaned job found from previous session:', orphanedJob.job_id)
  }

  // Prune old clips on startup if retention is configured
  const retentionDays = settingsManager.get().clipRetentionDays
  if (retentionDays > 0) {
    const pruned = clipStore.pruneByAge(retentionDays)
    if (pruned > 0) log.info(`[App] Pruned ${pruned} clips older than ${retentionDays} days`)
  }
  clipStore.pruneOrphanedThumbnails()

  // Show splash launcher while we check for updates
  const splashWindow = createSplashWindow()

  createTray()

  // Called when updater confirms no update pending (or errors out).
  // Close splash and open the main window.
  const launchMainApp = () => {
    mainWindow = createMainWindow(authManager.isAuthenticated())
    markStartupComplete()
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
          body: `ffmpeg not found: ${result.error ?? 'unknown error'}. Recording will not work.`,
          silent: notifySilent()
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

  // Proactively detect audio capture method in the background at startup.
  // On Windows: detects WASAPI / DirectShow Stereo Mix.
  // On Mac: detects virtual loopback devices (BlackHole, Soundflower, Loopback, etc.).
  // This ensures the audio mode is cached before the user opens settings for the first time.
  if (process.platform === 'win32' || process.platform === 'darwin') {
    recorder.redetectAudio().catch((err) => {
      console.warn('[App] Background audio detection failed:', err)
    })
  }

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
  }, performanceManager, obsRecorder, trainerBridge)

  setupClipHandlers(ipcMain, clipStore, clipExtractor, authManager, hotkeyManager)

  // Discord Rich Presence — renderer can push state changes (e.g. when reviewing coaching)
  ipcMain.handle('discord:set-state', (_e, state: string) => {
    if (state === 'reviewing') discordRPC.setReviewing()
    else discordRPC.setIdle()
  })

  // Developer diagnostics — full internal state snapshot for the admin panel
  ipcMain.handle('dev:get-diagnostics', () => {
    return {
      app: {
        version: app.getVersion(),
        platform: process.platform,
        arch: process.arch,
        electronVersion: process.versions.electron,
        nodeVersion: process.versions.node,
        isDev: is.dev,
      },
      riot: riotLocalApi.getDiagnostics(),
      recording: {
        active: recorder.isRecording(),
        duration: recorder.getRecordingDuration(),
        lastError: recorder.getLastError() ?? null,
        lastPath: recorder.getLastRecordingPath() ?? null,
        lastSizeMb: recorder.getLastRecordingSize() / (1024 * 1024),
        wasapiMode: recorder.getAudioMode(),
      },
      lastMatch: lastMatchDiagnostic,
      clips: {
        total: clipStore.getAll().length,
      },
      activityLog: activityLog.slice(),
    }
  })


  ipcMain.handle('recorder:audio-status', () => {
    return {
      winAudioMode: recorder.getAudioMode(),
      audioEnabled: settingsManager.get().audioEnabled,
    }
  })

  ipcMain.handle('recorder:fix-audio', async () => {
    const mode = await recorder.redetectAudio()
    return { winAudioMode: mode }
  })


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
      const currentGame = gameDetector.currentGame()
      const gameLbl = currentGame ? gameLabel(currentGame) : 'a'
      logActivity(`F9 pressed — not recording (start a ${gameLbl} match first)`)
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
    reportError({ message: 'F9 (save-clip) hotkey failed to register — users cannot bookmark clips via keyboard', component: 'desktop:HotkeyManager' })
  }
  // Send hotkey registration status to any open window so the UI can show a warning
  const hotkeyStatus = {
    saveClipRegistered: !!hotkeyResults['save-clip'],
    toggleOverlayRegistered: !!hotkeyResults['toggle-overlay'],
    screenshotRegistered: !!hotkeyResults['take-screenshot'],
  }
  mainWindow?.webContents.send('app:hotkey-status', hotkeyStatus)

  // Overlay window is created lazily just before recording starts to avoid
  // breaking Valorant's exclusive fullscreen mode (which causes FPS drops).

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
    // Only return videoPath if the file actually exists on disk
    const videoPath = recording.path && fs.existsSync(recording.path) ? recording.path : null
    return {
      id: recording.id,
      videoPath,
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
      spikePlants: tl?.spikePlants ?? [],
      spikeDefuses: tl?.spikeDefuses ?? [],
      spikeDetonations: tl?.spikeDetonations ?? [],
      firstBloods: tl?.firstBloods ?? [],
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

// Prevent the network-service utility process crash from killing the whole app
app.on('child-process-gone', (_event, details) => {
  log.warn('[Main] Child process gone:', details.type, details.reason)
})

app.on('before-quit', () => {
  isQuitting = true
  if (trayRefreshInterval) clearInterval(trayRefreshInterval)
  tray?.destroy()
  tray = null
  cancelAllPollingTimers()
  gameDetector.stop()
  recorder.forceStop()
  hotkeyManager.unregisterAll()
  globalShortcut.unregisterAll()
  destroyOverlay()
  discordRPC.destroy()
})
