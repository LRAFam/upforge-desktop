import { registeredLocalRecordingPaths } from './local-media-paths'
import { backgroundWork } from './background-work'
import { canScanForOrphanRecordings, resolveOrphanRecordingGame } from './recording-session-log'
import { dialog } from 'electron'
import fs from 'fs'
import { showAppNotification } from './app-notifications'
import { pingDesktopOnboarding } from './onboarding-ping'
import { hasProAccess } from './subscription'
import { abortVodCompression } from './match-priority-guard'
import { bumpAccountScope } from './account-scope'
import { listUnregisteredRecordingFiles } from './recording-path-resolver'
import { gameLabel, normalizeGameId as normalizePrimaryGame, type GameId } from './game-config'
import { activateUserSession, getActiveUserId, persistActiveUserOverlay } from './user-session'
import { resolveRecordingSavePath } from './user-data-paths'
import { stopActiveAnalysisPoll } from './analysis-poll'
import { SettingsManager } from './settings-manager'
import { isTrainerGame } from '../../src/lib/trainer-games'
import { type PendingRecording } from './recordings-store'
import { buildOrphanValorantTimeline, inspectOrphanRecordingTiming } from './orphan-recording-recovery'
import log from 'electron-log'
import { cleanupLegacyRecordingDuplicates, isLocalOnlyRecording, runRecordingStorageMaintenance } from './storage-cleanup'
import { isOwnedRecordingFile } from './owned-recording-files'
import { expiryNotificationBody, localExpiryDeleteAt } from './recording-expiry'
import { untrackedNotificationBody } from './untracked-recording-grace'
import { clearPostGameSession } from './post-game-session'
import { stopDeadlockLogWatcher } from './deadlock-match-watcher'
import type { MainRuntimeBindings } from './main-runtime-context'

export type MainSessionContext = Pick<MainRuntimeBindings,
  | 'authManager'
  | 'captureOwnership'
  | 'clipStore'
  | 'cs2DemoRetrieval'
  | 'discordRPC'
  | 'ensureObsCaptureForGame'
  | 'extractMatchClips'
  | 'focusMainWindow'
  | 'gameDetector'
  | 'guestClaimDeclinedFor'
  | 'guestClaimInFlight'
  | 'initPostMatchWorker'
  | 'lastMatchDiagnostic'
  | 'lastReplayRetryContext'
  | 'localMediaWork'
  | 'logActivity'
  | 'lolAccountsFetchedAt'
  | 'mainWindow'
  | 'matchFinalizeInFlight'
  | 'maybeAutoEnqueueWhenReady'
  | 'notifyRecordingsUpdated'
  | 'obsRecorder'
  | 'orphanedRecordingsScanned'
  | 'postGameWindow'
  | 'postMatchJobStore'
  | 'postMatchQueueUserId'
  | 'postMatchWorker'
  | 'reconcileInterruptedUploads'
  | 'recordingFileFinalizer'
  | 'recordingSessionLog'
  | 'recordingsStore'
  | 'refreshReplayTimelineForRecording'
  | 'replayAttempts'
  | 'replayScope'
  | 'restoreDeferredUploadsFromDisk'
  | 'resumeStuckMatchStatsEnrichment'
  | 'riotLocalApi'
  | 'scheduleAnalysisReadinessRefresh'
  | 'settingsManager'
  | 'startupFailures'
  | 'trackedPrimaryGame'
  | 'updateTrayMenuFn'
  | 'uploadManager'
  | 'userSessionDeps'
  | 'waitingForMatch'
>

/** Keeps callbacks bound to the live application state rather than a startup snapshot. */
export function createMainSession(mainProcess: MainSessionContext) {
  function syncPrimaryGameFromUser(): void {
    const user = mainProcess.authManager.getUser()
    const apiGame = user?.primary_game
    if (!apiGame || !mainProcess.settingsManager) return
    const game = normalizePrimaryGame(apiGame)
    const current = mainProcess.settingsManager.get()
    mainProcess.settingsManager.save({
      primaryGame: game,
      // The trainer follows games it has a sensitivity scale for (not League), with that game's own sensitivity.
      ...(isTrainerGame(game) ? { trainerMouse: { ...current.trainerMouse, game } } : {}),
    })
    mainProcess.mainWindow?.webContents.send('settings:changed', mainProcess.settingsManager.get())
    handlePrimaryGameSwitch(game, current.primaryGame)
    mainProcess.trackedPrimaryGame = game
  }

  function syncPrimaryGameFromDetection(game: string): void {
    if (!mainProcess.settingsManager) return
    const detected = normalizePrimaryGame(game)
    const primary = normalizePrimaryGame(mainProcess.settingsManager.get().primaryGame)
    if (detected !== primary) {
      log.info(
        `[GameDetector] Tracking ${detected} — settings primary is ${primary} (not auto-switching)`,
      )
    }
  }

  function handlePrimaryGameSwitch(
    game: GameId,
    previousGame?: GameId,
  ): void {
    if (previousGame === game) return

    const deferActiveStop = mainProcess.obsRecorder.isRecording()
    mainProcess.gameDetector.setWatchGame(game, { deferActiveStop })
    mainProcess.logActivity(`Switched to ${gameLabel(game)}`)

    // Never retarget the capture source under a recording UpForge still owns (card 232:
    // a failed stop + tab auto-switch pointed the stuck League recording at Valorant).
    // game-started sets capture up once ownership is resolved.
    if (!mainProcess.obsRecorder.isRecording()) void mainProcess.ensureObsCaptureForGame(game)

    if (game !== 'deadlock') {
      stopDeadlockLogWatcher()
    }

    mainProcess.updateTrayMenuFn?.()
  }

  function onSettingsSaved(settings: ReturnType<SettingsManager['get']>): void {
    persistActiveUserOverlay(mainProcess.settingsManager)
    mainProcess.discordRPC.refresh()
    const game = normalizePrimaryGame(settings.primaryGame)
    handlePrimaryGameSwitch(game, mainProcess.trackedPrimaryGame)
    mainProcess.trackedPrimaryGame = game
  }

  function syncUserSessionFromAuth(): void {
    const user = mainProcess.authManager.getUser()
    mainProcess.riotLocalApi.setLinkedAccountRegion(user?.riot_region ?? null)
    if (user?.id) {
      const previousUserId = getActiveUserId()
      if (previousUserId != null && previousUserId !== user.id) {
        clearAccountScopedRuntimeState()
      }
      mainProcess.captureOwnership.set(user.id)
      activateUserSession(user.id, mainProcess.userSessionDeps())
      mainProcess.initPostMatchWorker(user.id)
      mainProcess.restoreDeferredUploadsFromDisk()
      void pingDesktopOnboarding(mainProcess.authManager)
      mainProcess.startupFailures.begin()
      mainProcess.reconcileInterruptedUploads()
      runStorageMaintenanceIfReady(true)
      syncPrimaryGameFromUser()
      resumeSavedLocalMedia()
      mainProcess.resumeStuckMatchStatsEnrichment()
      void offerGuestMediaClaim()
    }
    enforceRecordingPresetAccess()
  }

  function resumeSavedLocalMedia(): void {
    void mainProcess.recordingFileFinalizer.tick()
    const userId = getActiveUserId()
    if (!mainProcess.recordingsStore || userId === null || !mainProcess.authManager.isAuthenticated()) return
    if (mainProcess.localMediaWork > 0 || mainProcess.obsRecorder.isRecording()) return
    for (const rec of mainProcess.recordingsStore.getPending()) {
      if (rec.fileFinalizing) continue
      if (!rec.savedOffline && !rec.pendingClipBookmarks?.length) continue
      mainProcess.recordingsStore.markSavedOffline(rec.id, false)
      if (rec.clipsOnly) continue
      if (rec.game === 'cs2' || rec.game === 'deadlock') {
        void mainProcess.refreshReplayTimelineForRecording(rec.id).catch(err => log.warn('[LocalCapture] Replay sync deferred:', err))
      }
      if (rec.game === 'valorant' || rec.game === 'lol') {
        mainProcess.scheduleAnalysisReadinessRefresh(rec.id, rec.game, { force: true })
      }
      if (rec.pendingClipBookmarks?.length || (rec.timeline && !mainProcess.clipStore.getAll().some(clip =>
        rec.timeline?.matchId != null && clip.matchId === rec.timeline.matchId,
      ))) {
        void mainProcess.extractMatchClips(rec.path, rec.timeline, rec.jobId ?? null, rec.game, userId, {
          recordingStartTime: rec.captureRecordingStartTime ?? rec.timeline?.recordingStartTime ?? null,
          bookmarks: rec.pendingClipBookmarks?.slice() ?? [],
        })
          .catch(err => log.warn('[LocalCapture] Clip recovery deferred:', err))
      }
      mainProcess.maybeAutoEnqueueWhenReady(rec.id)
    }
    mainProcess.notifyRecordingsUpdated()
  }

  async function offerGuestMediaClaim(): Promise<void> {
    const user = mainProcess.authManager.getUser()
    if (!mainProcess.recordingsStore || !user || !mainProcess.authManager.isAuthenticated() || mainProcess.guestClaimInFlight) return
    if (mainProcess.localMediaWork > 0 || mainProcess.obsRecorder.isRecording() || mainProcess.waitingForMatch) return
    if (mainProcess.guestClaimDeclinedFor === user.id) return
    const recordings = mainProcess.recordingsStore.forUser(null).getPending()
    const clips = mainProcess.clipStore.forUser(null).getAll()
    if (recordings.length === 0 && clips.length === 0) return
    mainProcess.guestClaimInFlight = true
    try {
      const choice = await dialog.showMessageBox({
        type: 'question',
        title: 'Keep local recordings',
        message: 'Add recordings from this computer to your account?',
        detail: `${recordings.length} matches and ${clips.length} clips were saved without an UpForge account. Only add them if they are yours. They will appear in ${user.email}'s library and stay local until you choose to upload or analyse them.`,
        buttons: ['Keep in my library', 'Not now'],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
      })
      if (choice.response !== 0) { mainProcess.guestClaimDeclinedFor = user.id; return }
      if (!mainProcess.authManager.isAuthenticated() || getActiveUserId() !== user.id) return
      if (mainProcess.localMediaWork > 0 || mainProcess.obsRecorder.isRecording() || mainProcess.waitingForMatch) return
      mainProcess.recordingsStore.claimGuest(user.id)
      mainProcess.clipStore.claimGuest(user.id)
      mainProcess.notifyRecordingsUpdated()
      mainProcess.mainWindow?.webContents.send('clips:new', clips.map(clip => clip.id))
      resumeSavedLocalMedia()
    } catch (err) {
      log.error('[LocalCapture] Could not claim local recordings:', err)
    } finally {
      mainProcess.guestClaimInFlight = false
    }
  }

  function clearPostMatchQueueScope(): void {
    backgroundWork.cancel()
    mainProcess.uploadManager.abort()
    abortVodCompression()
    mainProcess.postMatchJobStore = null
    mainProcess.postMatchWorker = null
    mainProcess.postMatchQueueUserId = null
  }

  function clearAccountScopedRuntimeState(): void {
    mainProcess.replayScope++
    bumpAccountScope()
    mainProcess.cs2DemoRetrieval.clear()
    mainProcess.replayAttempts.clear()
    stopActiveAnalysisPoll()
    clearPostMatchQueueScope()
    if (mainProcess.postGameWindow && !mainProcess.postGameWindow.isDestroyed()) {
      mainProcess.postGameWindow.destroy()
    }
    mainProcess.postGameWindow = null
    clearPostGameSession()
    mainProcess.lastReplayRetryContext = null
    mainProcess.lastMatchDiagnostic = null
  }

  /** When auto-delete will remove this local-only recording (shown as "Deletes in N days"), or null. */
  function rowLocalExpiresAt(rec: PendingRecording): number | null {
    if (!mainProcess.settingsManager || rec.savedOffline || rec.productionFixture || !isLocalOnlyRecording(rec)) return null
    if (rec.orphanedImport && !isOwnedRecordingFile(rec.path)) return null // user's own video: never auto-deleted
    return localExpiryDeleteAt(rec, mainProcess.settingsManager.get().recordingRetentionDays)
  }

  function runStorageMaintenanceIfReady(notify = false): void {
    if (!mainProcess.recordingsStore || !mainProcess.settingsManager) return
    const maintenance = runRecordingStorageMaintenance({
      store: mainProcess.recordingsStore,
      savePath: recordingSavePath(),
      recordingRetentionDays: mainProcess.settingsManager.get().recordingRetentionDays,
      linkedRiot: linkedRiotFromAuth(),
    })
    if (maintenance.expiryWarnings.length > 0) {
      const soonest = Math.min(...maintenance.expiryWarnings.map(w => w.deleteAt))
      const body = expiryNotificationBody(maintenance.expiryWarnings.length, soonest)
      log.info(`[App] Local recording expiry warning: ${body}`)
      mainProcess.logActivity(body)
      showAppNotification({
        title: 'UpForge — Recordings expiring',
        body,
        deferWhileRecording: true,
        onClick: () => mainProcess.focusMainWindow(),
      })
      mainProcess.notifyRecordingsUpdated()
    }
    if (maintenance.untrackedWarnings.length > 0) {
      const body = untrackedNotificationBody(maintenance.untrackedWarnings)
      log.info(`[App] Untracked recording warning: ${body}`)
      mainProcess.logActivity(body)
      showAppNotification({
        title: 'UpForge — Untracked recordings',
        body,
        deferWhileRecording: true,
        onClick: () => mainProcess.focusMainWindow(),
      })
    }
    if (maintenance.freedBytes > 0) {
      log.info(
        `[App] Storage maintenance freed ${(maintenance.freedBytes / (1024 ** 3)).toFixed(2)} GB`,
      )
      if (notify) {
        mainProcess.logActivity(
          `Freed ${(maintenance.freedBytes / (1024 ** 3)).toFixed(1)} GB of old local recordings`,
        )
        mainProcess.notifyRecordingsUpdated()
        mainProcess.mainWindow?.webContents.send('dashboard:refresh')
      }
    }
    const savePath = recordingSavePath()
    void cleanupLegacyRecordingDuplicates(savePath)
      .then((legacy) => {
        if (legacy.removed > 0) {
          log.info(`[App] Removed ${legacy.removed} verified legacy duplicate recording(s)`)
        }
      })
      .catch(err => log.warn('[App] Legacy duplicate cleanup failed:', err))
  }

  function enforceRecordingPresetAccess(): void {
    if (!mainProcess.settingsManager) return
    const allowCreator = hasProAccess(mainProcess.authManager.getUser())
    const current = mainProcess.settingsManager.get()
    if (current.recordingPreset === 'creator' && !allowCreator) {
      mainProcess.settingsManager.save({ recordingPreset: 'coaching' }, { allowCreator: false })
    }
  }

  function recordingSavePath(): string {
    return resolveRecordingSavePath(mainProcess.settingsManager?.get().savePath, getActiveUserId())
  }

  /** Every Riot account the signed-in user has linked, with the active one marked as main. */
  function linkedRiotAccountsFromAuth(): Array<{ name: string; tag: string; isMain: boolean }> {
    const user = mainProcess.authManager.getUser()
    const out = (user?.riot_accounts ?? [])
      .filter(a => a.riot_name?.trim() && a.riot_tag?.trim())
      .map(a => ({ name: a.riot_name, tag: a.riot_tag, isMain: !!a.is_active }))
    const primary = linkedRiotFromAuth()
    if (primary && !out.some(a => a.name.toLowerCase() === primary.name.toLowerCase() && a.tag.toLowerCase() === primary.tag.toLowerCase())) {
      out.unshift({ ...primary, isMain: !out.some(a => a.isMain) })
    }
    return out
  }

  function linkedLolAccountsFromAuth(): Array<{ name: string; tag: string; isMain: boolean }> {
    if (mainProcess.authManager.isAuthenticated() && Date.now() - mainProcess.lolAccountsFetchedAt > 60_000) {
      mainProcess.lolAccountsFetchedAt = Date.now()
      void mainProcess.authManager.listLolAccounts().catch(() => null)
    }
    const cached = mainProcess.authManager.getCachedLolAccounts().map(a => ({ name: a.riot_name, tag: a.riot_tag, isMain: a.is_main }))
    if (cached.length) return cached
    // Before the first list arrives (or an older API): the single League link is the main.
    const user = mainProcess.authManager.getUser()
    return user?.lol_riot_name?.trim() && user?.lol_riot_tag?.trim()
      ? [{ name: user.lol_riot_name, tag: user.lol_riot_tag, isMain: true }]
      : []
  }

  function linkedRiotFromAuth() {
    const user = mainProcess.authManager.getUser()
    if (!user?.riot_name?.trim() || !user?.riot_tag?.trim()) return null
    return { name: user.riot_name, tag: user.riot_tag }
  }

  /** Pick up recent local MP4s that never made it into recordings.json (e.g. post-game window closed early). */
  function scanForOrphanedRecordings(force = false, opts: { fromMatchEnd?: boolean } = {}): number {
    if (!mainProcess.settingsManager || !mainProcess.recordingsStore) return 0
    // A growing OBS file is not an orphan yet, and a match end still saving its file registers it
    // itself (importing it here first made a duplicate row labelled with a guessed game).
    if (!canScanForOrphanRecordings({
      recording: mainProcess.obsRecorder.isRecording(),
      matchEndInFlight: mainProcess.matchFinalizeInFlight !== null,
      fromMatchEnd: opts.fromMatchEnd,
    })) return 0
    if (mainProcess.orphanedRecordingsScanned && !force) return 0
    mainProcess.orphanedRecordingsScanned = true

    const savePath = recordingSavePath()
    const known = mainProcess.recordingsStore.getKnownPaths()
    try {
      for (const registered of registeredLocalRecordingPaths()) known.add(registered)
    } catch (err) {
      log.warn('[LocalCapture] Orphan recovery paused because a media catalogue could not be read:', err)
      return 0
    }
    for (const excludedPath of mainProcess.settingsManager.get().obsNonMatchRecordingPaths ?? []) {
      known.add(excludedPath)
    }
    const orphans = listUnregisteredRecordingFiles(
      savePath,
      known,
      Date.now() - 24 * 60 * 60 * 1000,
    )
    if (orphans.length === 0) return 0

    const user = mainProcess.authManager.getUser()
    const sessions = mainProcess.recordingSessionLog().list()
    for (const file of orphans) {
      // Label by the recording session that owned the file; no session → 'unknown'. Never the
      // selected game tab (3.4.x: CS2 files imported under the Valorant tab became Valorant matches).
      let modifiedAtMs: number | null = null
      try { modifiedAtMs = fs.statSync(file.path).mtimeMs } catch { /* unknown */ }
      const orphanGame = resolveOrphanRecordingGame({ path: file.path, modifiedAtMs }, sessions)
      const timing = inspectOrphanRecordingTiming(file.path)
      const canRecoverValorant = orphanGame === 'valorant' && timing.status === 'ok'
      const timeline = canRecoverValorant
        ? buildOrphanValorantTimeline(timing, {
            name: user?.riot_name ?? null,
            tag: user?.riot_tag ?? null,
          })
        : null
      const saved = mainProcess.recordingsStore.add({
        path: file.path, // already preferred (compressed when sibling exists)
        riotName: user?.riot_name?.trim() ?? '',
        riotTag: user?.riot_tag?.trim() ?? '',
        game: orphanGame,
        map: null,
        agent: null,
        gameMode: 'UNKNOWN',
        timeline,
        orphanedImport: true,
        orphanRecoveryError: timing.status === 'missing' ? timing.reason : null,
      }, timing.status === 'ok' ? timing.startTimeMs : Date.now())
      mainProcess.recordingsStore.clearAnalysisPipeline(saved.id)
      if (timeline) mainProcess.scheduleAnalysisReadinessRefresh(saved.id, orphanGame)
    }
    log.info(`[Recordings] Imported ${orphans.length} local file(s) into dashboard`)
    mainProcess.logActivity(`Found ${orphans.length} local recording(s) — added to dashboard`)
    mainProcess.notifyRecordingsUpdated()
    return orphans.length
  }

  function isLegacyBareValorantOrphan(rec: PendingRecording): boolean {
    return rec.game === 'valorant'
      && rec.timeline == null
      && rec.map == null
      && rec.agent == null
      && rec.gameMode === 'UNKNOWN'
      && !rec.riotName.trim()
      && !rec.riotTag.trim()
      && Boolean(rec.path)
  }

  /** Upgrade rows imported by older builds so their existing local VOD can still recover. */
  function prepareLegacyOrphanRecoveryRows(): void {
    const user = mainProcess.authManager.getUser()
    for (const rec of mainProcess.recordingsStore.getAll()) {
      if (!isLegacyBareValorantOrphan(rec)) continue
      const timing = inspectOrphanRecordingTiming(rec.path)
      if (timing.status === 'missing') {
        mainProcess.recordingsStore.setOrphanRecoveryError(rec.id, timing.reason)
        continue
      }
      const timeline = buildOrphanValorantTimeline(timing, {
        name: user?.riot_name ?? null,
        tag: user?.riot_tag ?? null,
      })
      mainProcess.recordingsStore.prepareOrphanRecovery(rec.id, {
        timeline,
        recordedAt: timing.startTimeMs,
        riotName: user?.riot_name?.trim() ?? '',
        riotTag: user?.riot_tag?.trim() ?? '',
      })
      log.info(`[Recordings] Prepared legacy orphan ${rec.id} for Riot metadata recovery`)
    }
  }

  return { syncPrimaryGameFromUser, syncPrimaryGameFromDetection, handlePrimaryGameSwitch, onSettingsSaved, syncUserSessionFromAuth, resumeSavedLocalMedia, offerGuestMediaClaim, clearPostMatchQueueScope, clearAccountScopedRuntimeState, rowLocalExpiresAt, runStorageMaintenanceIfReady, enforceRecordingPresetAccess, recordingSavePath, linkedRiotAccountsFromAuth, linkedLolAccountsFromAuth, linkedRiotFromAuth, scanForOrphanedRecordings, isLegacyBareValorantOrphan, prepareLegacyOrphanRecoveryRows }
}
