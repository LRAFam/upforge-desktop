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
    showClips: () => ipcRenderer.invoke('app:show-clips')
  },
  profile: {
    get: () => ipcRenderer.invoke('profile:get')
  },
  analyses: {
    get: (limit?: number) => ipcRenderer.invoke('analyses:get', { limit })
  },
  recordings: {
    get: () => ipcRenderer.invoke('recordings:get'),
    analyse: (id: string) => ipcRenderer.invoke('recordings:analyse', { id }),
    dismiss: (id: string) => ipcRenderer.invoke('recordings:dismiss', { id })
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
      ipcRenderer.invoke('dev:simulate-game', { game, durationMs })
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    close: () => ipcRenderer.invoke('window:close'),
    openPostGame: () => ipcRenderer.invoke('window:open-post-game')
  },
  recorder: {
    stop: () => ipcRenderer.invoke('recorder:stop')
  },
  updater: {
    check: () => ipcRenderer.invoke('updater:check')
  },
  debug: {
    testRiotApi: () => ipcRenderer.invoke('debug:test-riot-api')
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
    getHotkeys: () => ipcRenderer.invoke('clips:get-hotkeys'),
    getHotkeyStatus: () => ipcRenderer.invoke('clips:get-hotkey-status'),
    setHotkey: (action: string, accelerator: string) => ipcRenderer.invoke('clips:set-hotkey', { action, accelerator }),
    upload: (id: string) => ipcRenderer.invoke('clips:upload', { id }),
    requestAnalysis: (id: string) => ipcRenderer.invoke('clips:request-analysis', { id }),
    share: (id: string) => ipcRenderer.invoke('clips:share', { id }),
    publish: (id: string, caption?: string) => ipcRenderer.invoke('clips:publish', { id, caption }),
    saveBookmark: () => ipcRenderer.invoke('clips:save-bookmark'),
  },
  squad: {
    getTeam: () => ipcRenderer.invoke('squad:get-team'),
    sendPresence: (recording: boolean, game: string | null) => ipcRenderer.invoke('squad:send-presence', { recording, game })
  },
  stats: {
    rrHistory: () => ipcRenderer.invoke('stats:rr-history')
  },
  overlay: {
    toggle: () => ipcRenderer.invoke('overlay:toggle'),
    setInteractive: (interactive: boolean) => ipcRenderer.send('overlay:set-interactive', interactive),
  },
  performance: {
    getStatus: () => ipcRenderer.invoke('performance:get-status'),
    boost: () => ipcRenderer.invoke('performance:boost'),
    restore: () => ipcRenderer.invoke('performance:restore'),
  },
  on: (channel: string, callback: (...args: unknown[]) => void): (() => void) => {
    const allowed = [
      'post-game:upload-start',
      'post-game:upload-progress',
      'post-game:upload-complete',
      'post-game:analysis-ready',
      'post-game:upload-error',
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
      'overlay:clip-bookmarked',
      'app:navigate',
      'analysis:timeout',
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
