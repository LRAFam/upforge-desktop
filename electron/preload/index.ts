import { contextBridge, ipcRenderer } from 'electron'

const api = {
  auth: {
    login: (email: string, password: string) =>
      ipcRenderer.invoke('auth:login', { email, password }),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getUser: () => ipcRenderer.invoke('auth:get-user'),
    refreshUser: () => ipcRenderer.invoke('auth:refresh-user'),
    loadStored: () => ipcRenderer.invoke('auth:load-stored')
  },
  app: {
    getStatus: () => ipcRenderer.invoke('app:get-status'),
    getActivityLog: () => ipcRenderer.invoke('app:get-activity-log'),
    showClips: () => ipcRenderer.invoke('app:show-clips'),
    openUrl: (url: string) => ipcRenderer.invoke('app:open-url', { url }),
    openVodReview: (id: string, seekMs?: number) =>
      ipcRenderer.invoke('app:open-vod-review', { id, seekMs }),
  },
  profile: {
    get: () => ipcRenderer.invoke('profile:get')
  },
  billing: {
    openPortal: () => ipcRenderer.invoke('billing:open-portal') as Promise<{ ok: boolean; error?: string }>,
  },
  analyses: {
    get: (limit?: number) => ipcRenderer.invoke('analyses:get', { limit }),
    getTimeline: (id: number) => ipcRenderer.invoke('analyses:get-timeline', { id }),
    refreshPlayback: (id: number) => ipcRenderer.invoke('analyses:refresh-playback', { id }),
    getDetail: (id: number) => ipcRenderer.invoke('analyses:get-detail', { id }),
    getPercentiles: (id: number) => ipcRenderer.invoke('analyses:get-percentiles', { id }),
    reconcileStuck: () => ipcRenderer.invoke('analysis:reconcile-stuck') as Promise<{ ok: boolean; reconciled: number }>,
    submitFeedback: (opts: {
      analysisId: number
      rating: 'thumbs_up' | 'thumbs_down'
      feedbackText?: string
    }) => ipcRenderer.invoke('analyses:submit-feedback', opts),
  },
  archives: {
    refreshPlayback: (archiveId: string) =>
      ipcRenderer.invoke('archives:refresh-playback', { archiveId }),
  },
  recordings: {
    get: () => ipcRenderer.invoke('recordings:get'),
    analyse: (id: string) => ipcRenderer.invoke('recordings:analyse', { id }),
    saveToCloud: (id: string) => ipcRenderer.invoke('recordings:save-to-cloud', { id }),
    dismiss: (id: string, opts?: { deleteLocal?: boolean }) =>
      ipcRenderer.invoke('recordings:dismiss', { id, deleteLocal: opts?.deleteLocal }),
    abortInFlight: (id: string) => ipcRenderer.invoke('recordings:abort-in-flight', { id }),
    getTimeline: (id: string) => ipcRenderer.invoke('recordings:get-timeline', { id }),
    refreshPlayback: (id: string) => ipcRenderer.invoke('recordings:refresh-playback', { id }),
        nudgeSync: (id: string, deltaMs: number) => ipcRenderer.invoke('recordings:nudge-sync', { id, deltaMs }),
        resetSync: (id: string) => ipcRenderer.invoke('recordings:reset-sync', { id }),
        trim: (id: string, startSec: number, endSec: number) =>
          ipcRenderer.invoke('recordings:trim', { id, startSec, endSec }),
    previewDuelWindow: (
      id: string,
      opts: { windowStartMs: number; windowEndMs: number; momentId: string },
    ) => ipcRenderer.invoke('recordings:preview-duel-window', { id, ...opts }),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    save: (partial: Record<string, unknown>) => ipcRenderer.invoke('settings:save', partial)
  },
  dialog: {
    openDirectory: () => ipcRenderer.invoke('dialog:open-directory')
  },
  dev: {
    simulateGame: (game?: string, durationMs?: number) =>
      ipcRenderer.invoke('dev:simulate-game', { game, durationMs }),
    getDiagnostics: () => ipcRenderer.invoke('dev:get-diagnostics'),
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    close: () => ipcRenderer.invoke('window:close'),
    openPostGame: () => ipcRenderer.invoke('window:open-post-game'),
    setContentHeight: (height: number) => ipcRenderer.invoke('window:set-content-height', height),
    applyLayout: (routePath: string) => ipcRenderer.invoke('window:apply-layout', routePath),
  },
  postGame: {
    sync: () => ipcRenderer.invoke('post-game:sync'),
    retryDemoScan: () => ipcRenderer.invoke('post-game:retry-demo-scan'),
  },
  recorder: {
    stop: () => ipcRenderer.invoke('recorder:stop'),
    getAudioStatus: () => ipcRenderer.invoke('recorder:audio-status'),
    fixAudio: () => ipcRenderer.invoke('recorder:fix-audio'),
  },
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    getState: () => ipcRenderer.invoke('updater:getState'),
    install: () => ipcRenderer.invoke('updater:install'),
  },
  debug: {
    testRiotApi: () => ipcRenderer.invoke('debug:test-riot-api'),
    findHotkeyConflict: () => ipcRenderer.invoke('debug:find-hotkey-conflict'),
  },
  storage: {
    getUsage: () => ipcRenderer.invoke('storage:get-usage'),
    getEstimate: () => ipcRenderer.invoke('storage:get-estimate'),
    getBreakdown: () => ipcRenderer.invoke('storage:get-breakdown'),
    purgeCloudBacked: () => ipcRenderer.invoke('storage:purge-cloud-backed'),
    purgeOrphans: () => ipcRenderer.invoke('storage:purge-orphans'),
    uploadPending: () => ipcRenderer.invoke('storage:upload-pending'),
    openFolder: () => ipcRenderer.invoke('storage:open-folder')
  },
  clips: {
    get: (opts?: { game?: string; allGames?: boolean }) => ipcRenderer.invoke('clips:get', opts ?? {}),
    getThumbnail: (id: string) => ipcRenderer.invoke('clips:get-thumbnail', { id }),
    delete: (id: string) => ipcRenderer.invoke('clips:delete', { id }),
    deleteMany: (ids: string[]) => ipcRenderer.invoke('clips:delete-many', { ids }),
    bulkFavorite: (ids: string[], favorited: boolean) => ipcRenderer.invoke('clips:bulk-favorite', { ids, favorited }),
    updateTitle: (id: string, title: string) => ipcRenderer.invoke('clips:update-title', { id, title }),
    openFolder: (id: string) => ipcRenderer.invoke('clips:open-folder', { id }),
    revealFile: (id: string) => ipcRenderer.invoke('clips:reveal-file', { id }),
    toggleFavorite: (id: string) => ipcRenderer.invoke('clips:toggle-favorite', { id }),
    getHotkeys: () => ipcRenderer.invoke('clips:get-hotkeys'),
    getHotkeyStatus: () => ipcRenderer.invoke('clips:get-hotkey-status'),
    setHotkey: (action: string, accelerator: string) => ipcRenderer.invoke('clips:set-hotkey', { action, accelerator }),
    upload: (id: string) => ipcRenderer.invoke('clips:upload', { id }),
    requestAnalysis: (id: string) => ipcRenderer.invoke('clips:request-analysis', { id }),
    share: (id: string) => ipcRenderer.invoke('clips:share', { id }),
    publish: (id: string, caption?: string) => ipcRenderer.invoke('clips:publish', { id, caption }),
    saveBookmark: () => ipcRenderer.invoke('clips:save-bookmark'),
    trim: (id: string, startSec: number, endSec: number) => ipcRenderer.invoke('clips:trim', { id, startSec, endSec }),
  },
  recap: {
    exportStitched: (opts: {
      recordingId: string
      highlights: Array<{ id: string; clipId?: string | null; videoOffsetMs?: number | null; rank?: number }>
      maxMoments?: number
    }) => ipcRenderer.invoke('recap:export-stitched', opts),
  },
  squad: {
    getTeam: () => ipcRenderer.invoke('squad:get-team'),
    sendPresence: (recording: boolean, game: string | null) => ipcRenderer.invoke('squad:send-presence', { recording, game }),
    syncPresence: () => ipcRenderer.invoke('squad:sync-presence'),
  },
  coach: {
    getMyCoaches: () => ipcRenderer.invoke('coach:get-my-coaches'),
    requestRosterReview: (opts: {
      analysisId: number
      coachId: number
      question?: string
      roundNumbers?: number[]
    }) => ipcRenderer.invoke('coach:request-roster-review', opts),
    getAnalysisReview: (analysisId: number) =>
      ipcRenderer.invoke('coach:get-analysis-review', { analysisId }),
    getReviewAnnotations: (reviewId: number) =>
      ipcRenderer.invoke('coach:get-review-annotations', { reviewId }),
  },
  stats: {
    rrHistory: () => ipcRenderer.invoke('stats:rr-history')
  },
  progress: {
    playstyleProfile: () => ipcRenderer.invoke('progress:playstyle-profile')
  },
  overlay: {
    toggle: () => ipcRenderer.invoke('overlay:toggle'),
    setInteractive: (interactive: boolean) => ipcRenderer.send('overlay:set-interactive', interactive),
  },
  screenshots: {
    capture: async (): Promise<string | null> => {
      const result = await ipcRenderer.invoke('screenshots:capture-screen') as { ok?: boolean; dataUrl?: string }
      return result?.ok ? (result.dataUrl ?? null) : null
    },
    save: (dataUrl: string) => ipcRenderer.invoke('screenshots:save', { dataUrl }),
  },
  desktopCapture: {
    /** Returns available screen sources for getUserMedia capture. Only screens are returned
     *  (not individual application windows) so fullscreen games are always captured whole. */
    getSources: async (): Promise<{ id: string; name: string }[]> => {
      const result = await ipcRenderer.invoke('desktop-capturer:get-sources', ['screen']) as {
        ok?: boolean; sources?: { id: string; name: string }[]
      }
      return result?.ok && result.sources ? result.sources : []
    },
    /** Tell the main process which source to capture before calling getUserMedia (required Electron 20+). */
    setSource: (sourceId: string, audioEnabled?: boolean): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('desktop-capturer:set-source', sourceId, audioEnabled),
    /** Send a recorded chunk (ArrayBuffer) to the main process for disk writing. */
    sendChunk: (chunk: ArrayBuffer) => ipcRenderer.send('desktop-recording:chunk', chunk),
    /** Notify main process that MediaRecorder has started (and whether audio is available). */
    sendStarted: (noAudio: boolean) => ipcRenderer.send('desktop-recording:started', noAudio),
    /** Notify main process that MediaRecorder has fully stopped and all data is flushed. */
    sendComplete: () => ipcRenderer.send('desktop-recording:complete'),
    /** Notify main process of a fatal recording error. */
    sendError: (message: string) => ipcRenderer.send('desktop-recording:error', message),
  },
  performance: {
    getStatus: () => ipcRenderer.invoke('performance:get-status'),
    boost: () => ipcRenderer.invoke('performance:boost'),
    restore: () => ipcRenderer.invoke('performance:restore'),
    diagnostics: () => ipcRenderer.invoke('performance:diagnostics'),
    killProcess: (name: string) => ipcRenderer.invoke('performance:kill-process', name),
    getPregameKillList: () => ipcRenderer.invoke('performance:get-pregame-kill-list'),
    setPregameKillList: (list: string[]) => ipcRenderer.invoke('performance:set-pregame-kill-list', list),
  },
  obs: {
    connect: () => ipcRenderer.invoke('obs:connect'),
    launchAndConnect: () => ipcRenderer.invoke('obs:launch-and-connect'),
    disconnect: () => ipcRenderer.invoke('obs:disconnect'),
    getStatus: () => ipcRenderer.invoke('obs:get-status'),
    setupScene: () => ipcRenderer.invoke('obs:setup-scene'),
        saveReplayClip: () => ipcRenderer.invoke('obs:save-replay-clip'),
    installProfile: () => ipcRenderer.invoke('obs:install-profile'),
    installStudio: () => ipcRenderer.invoke('obs:install-studio'),
  },
  trainer: {
    launch: (config: Record<string, unknown>) => ipcRenderer.invoke('trainer:launch', config),
    kill: () => ipcRenderer.invoke('trainer:kill'),
    getHistory: () => ipcRenderer.invoke('trainer:get-history'),
    getCoachingDrills: () => ipcRenderer.invoke('trainer:get-coaching-drills'),
    getCorrelation: () => ipcRenderer.invoke('trainer:get-correlation'),
    getBenchmark: () => ipcRenderer.invoke('trainer:get-benchmark'),
    getAiCoaching: () => ipcRenderer.invoke('trainer:get-ai-coaching'),
    getLeaderboard: (scenario: string, period?: 'week' | 'month' | 'all') =>
      ipcRenderer.invoke('trainer:get-leaderboard', scenario, period),
  },
      deadlock: {
        listReplays: () => ipcRenderer.invoke('deadlock:list-replays'),
        openReplaysFolder: () => ipcRenderer.invoke('deadlock:open-replays-folder'),
        openAnalyze: () => ipcRenderer.invoke('deadlock:open-analyze'),
        openResults: (jobId: string) => ipcRenderer.invoke('deadlock:open-results', jobId),
        openDashboard: () => ipcRenderer.invoke('deadlock:open-dashboard'),
        openConnectSteam: () => ipcRenderer.invoke('deadlock:open-connect-steam'),
        getStats: (opts?: { fresh?: boolean }) => ipcRenderer.invoke('deadlock:get-stats', opts),
        getAnalyses: (limit?: number) => ipcRenderer.invoke('deadlock:get-analyses', limit),
        uploadDemo: (demoPath: string) => ipcRenderer.invoke('deadlock:upload-demo', demoPath),
        getDetectionStatus: () => ipcRenderer.invoke('deadlock:get-detection-status'),
        ensureCondebug: () => ipcRenderer.invoke('deadlock:ensure-condebug'),
      },
  cs2: {
    detectDemoDir: () => ipcRenderer.invoke('cs2:detect-demo-dir'),
    listDemos: () => ipcRenderer.invoke('cs2:list-demos'),
    openDemosFolder: () => ipcRenderer.invoke('cs2:open-demos-folder'),
    openAnalyze: () => ipcRenderer.invoke('cs2:open-analyze'),
    openDashboard: () => ipcRenderer.invoke('cs2:open-dashboard'),
    openConnectFaceit: () => ipcRenderer.invoke('cs2:open-connect-faceit'),
    getAnalyses: (limit?: number) => ipcRenderer.invoke('cs2:get-analyses', limit),
    getFaceitConnection: () => ipcRenderer.invoke('cs2:get-faceit-connection'),
  },
  forgeRank: {
    prestige: () => ipcRenderer.invoke('forge-rank:prestige'),
  },
  discord: {
    setState: (state: 'idle' | 'reviewing') => ipcRenderer.invoke('discord:set-state', state),
    getStatus: () => ipcRenderer.invoke('discord:get-status') as Promise<{
      connected: boolean
      enabled: boolean
      buttonsRegistered: boolean
      buttonLabels: string[]
      details: string | null
      state: string | null
    }>,
  },
  on: (channel: string, callback: (...args: unknown[]) => void): (() => void) => {
    const allowed = [
      'post-game:preparing',
      'post-game:prep-step',
      'post-game:upload-start',
      'post-game:compress-start',
      'post-game:upload-progress',
      'post-game:upload-complete',
      'post-game:analysis-progress',
      'post-game:analysis-long-running',
      'post-game:analysis-deferred',
      'post-game:upload-deferred',
      'post-game:analysis-ready',
      'post-game:upload-error',
      'dashboard:analysis-progress',
      'dashboard:analysis-failed',
      'dashboard:upload-progress',
      'dashboard:open-latest-analysis',
      'dashboard:analyse-recording',
      'post-game:pending',
      'post-game:analysis-readiness',
      'dashboard:refresh',
      'dashboard:last-insight',
      'recordings:updated',
      'storage:upload-progress',
      'recording:status-changed',
      'recording:waiting-for-match',
      'recording:starting',
      'app:warning',
      'app:activity-log',
      'app:activity-toast',
      'updater:checking',
      'updater:available',
      'updater:progress',
      'updater:downloaded',
      'updater:not-available',
      'updater:error',
      'clips:new',
      'overlay:data',
      'overlay:clip-bookmarked',
      'overlay:clip-not-recording',
      'overlay:screenshot',
      'overlay:screenshot-saved',
      'app:navigate',
      'analysis:timeout',
      'auth:session-expired',
      'session:user-changed',
      'clips:updated',
      'recordings:updated',
      'dashboard:refresh',
      'app:hotkey-status',
      'settings:changed',
      'desktop-recording:start',
      'desktop-recording:stop',
      'obs:replay-saved',
      'obs:connection-changed',
      'trainer:session-result',
      'post-game:demo-status',
      'post-game:demo-progress',
      'deadlock:upload-progress',
      'spatial:population-updated',
    ]
    if (allowed.includes(channel)) {
      const handler = (_e: Electron.IpcRendererEvent, ...args: unknown[]) => callback(...args)
      ipcRenderer.on(channel, handler)
      return () => ipcRenderer.removeListener(channel, handler)
    }
    return () => {}
  }
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('api', api)
} else {
  // @ts-ignore
  window.api = api
}
