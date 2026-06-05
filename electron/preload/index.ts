import { contextBridge, ipcRenderer } from 'electron'

const api = {
  auth: {
    login: (email: string, password: string) =>
      ipcRenderer.invoke('auth:login', { email, password }),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getUser: () => ipcRenderer.invoke('auth:get-user'),
    loadStored: () => ipcRenderer.invoke('auth:load-stored')
  },
  app: {
    getStatus: () => ipcRenderer.invoke('app:get-status'),
    getActivityLog: () => ipcRenderer.invoke('app:get-activity-log'),
    showClips: () => ipcRenderer.invoke('app:show-clips'),
    openUrl: (url: string) => ipcRenderer.invoke('app:open-url', { url })
  },
  profile: {
    get: () => ipcRenderer.invoke('profile:get')
  },
  analyses: {
    get: (limit?: number) => ipcRenderer.invoke('analyses:get', { limit }),
    getTimeline: (id: number) => ipcRenderer.invoke('analyses:get-timeline', { id }),
    getDetail: (id: number) => ipcRenderer.invoke('analyses:get-detail', { id }),
  },
  recordings: {
    get: () => ipcRenderer.invoke('recordings:get'),
    analyse: (id: string) => ipcRenderer.invoke('recordings:analyse', { id }),
    dismiss: (id: string) => ipcRenderer.invoke('recordings:dismiss', { id }),
    getTimeline: (id: string) => ipcRenderer.invoke('recordings:get-timeline', { id })
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
    openPostGame: () => ipcRenderer.invoke('window:open-post-game')
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
    openFolder: () => ipcRenderer.invoke('storage:open-folder')
  },
  clips: {
    get: () => ipcRenderer.invoke('clips:get'),
    getThumbnail: (id: string) => ipcRenderer.invoke('clips:get-thumbnail', { id }),
    delete: (id: string) => ipcRenderer.invoke('clips:delete', { id }),
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
  squad: {
    getTeam: () => ipcRenderer.invoke('squad:get-team'),
    sendPresence: (recording: boolean, game: string | null) => ipcRenderer.invoke('squad:send-presence', { recording, game }),
    syncPresence: () => ipcRenderer.invoke('squad:sync-presence'),
  },
  stats: {
    rrHistory: () => ipcRenderer.invoke('stats:rr-history')
  },
  overlay: {
    toggle: () => ipcRenderer.invoke('overlay:toggle'),
    setInteractive: (interactive: boolean) => ipcRenderer.send('overlay:set-interactive', interactive),
  },
  screenshots: {
    capture: (): Promise<string | null> => ipcRenderer.invoke('screenshots:capture-screen'),
    save: (dataUrl: string) => ipcRenderer.invoke('screenshots:save', { dataUrl }),
  },
  desktopCapture: {
    /** Returns available screen sources for getUserMedia capture. Only screens are returned
     *  (not individual application windows) so fullscreen games are always captured whole. */
    getSources: (): Promise<{ id: string; name: string }[]> =>
      ipcRenderer.invoke('desktop-capturer:get-sources', ['screen']),
    /** Tell the main process which source to capture before calling getUserMedia (required Electron 20+). */
    setSource: (sourceId: string): Promise<void> =>
      ipcRenderer.invoke('desktop-capturer:set-source', sourceId),
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
    disconnect: () => ipcRenderer.invoke('obs:disconnect'),
    getStatus: () => ipcRenderer.invoke('obs:get-status'),
    saveReplayClip: () => ipcRenderer.invoke('obs:save-replay-clip'),
  },
  trainer: {
    launch: (config: Record<string, unknown>) => ipcRenderer.invoke('trainer:launch', config),
    kill: () => ipcRenderer.invoke('trainer:kill'),
    getHistory: () => ipcRenderer.invoke('trainer:get-history'),
    getCoachingDrills: () => ipcRenderer.invoke('trainer:get-coaching-drills'),
    getCorrelation: () => ipcRenderer.invoke('trainer:get-correlation'),
    getBenchmark: () => ipcRenderer.invoke('trainer:get-benchmark'),
    getAiCoaching: () => ipcRenderer.invoke('trainer:get-ai-coaching'),
  },
  deadlock: {
    listReplays: () => ipcRenderer.invoke('deadlock:list-replays'),
    openReplaysFolder: () => ipcRenderer.invoke('deadlock:open-replays-folder'),
    openAnalyze: () => ipcRenderer.invoke('deadlock:open-analyze'),
    openDashboard: () => ipcRenderer.invoke('deadlock:open-dashboard'),
    getStats: () => ipcRenderer.invoke('deadlock:get-stats'),
  },
  cs2: {
    detectDemoDir: () => ipcRenderer.invoke('cs2:detect-demo-dir'),
  },
  forgeRank: {
    prestige: () => ipcRenderer.invoke('forge-rank:prestige'),
  },
  discord: {
    setState: (state: 'idle' | 'reviewing') => ipcRenderer.invoke('discord:set-state', state),
  },
  on: (channel: string, callback: (...args: unknown[]) => void): (() => void) => {
    const allowed = [
      'post-game:upload-start',
      'post-game:upload-progress',
      'post-game:upload-complete',
      'post-game:analysis-progress',
      'post-game:analysis-long-running',
      'post-game:analysis-deferred',
      'post-game:analysis-ready',
      'post-game:upload-error',
      'dashboard:analysis-progress',
      'post-game:pending',
      'dashboard:refresh',
      'dashboard:last-insight',
      'recordings:updated',
      'app:ffmpeg-status',
      'recording:status-changed',
      'recording:waiting-for-match',
      'recording:starting',
      'app:warning',
      'app:activity-log',
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
      'app:hotkey-status',
      'settings:changed',
      'desktop-recording:start',
      'desktop-recording:stop',
      'obs:replay-saved',
      'trainer:session-result',
      'post-game:demo-status',
      'post-game:demo-progress',
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
