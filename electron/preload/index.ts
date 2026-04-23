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
    getActivityLog: () => ipcRenderer.invoke('app:get-activity-log')
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
  storage: {
    getUsage: () => ipcRenderer.invoke('storage:get-usage'),
    openFolder: () => ipcRenderer.invoke('storage:open-folder')
  },
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    const allowed = [
      'post-game:upload-start',
      'post-game:upload-progress',
      'post-game:upload-complete',
      'post-game:analysis-ready',
      'post-game:upload-error',
      'post-game:pending',
      'dashboard:refresh',
      'recordings:updated',
      'app:ffmpeg-status',
      'recording:status-changed',
      'recording:waiting-for-match',
      'app:warning',
      'app:activity-log'
    ]
    if (allowed.includes(channel)) {
      ipcRenderer.on(channel, (_e, ...args) => callback(...args))
    }
  },
  off: (channel: string, callback: (...args: unknown[]) => void) => {
    ipcRenderer.removeListener(channel, callback)
  }
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('api', api)
} else {
  // @ts-ignore
  window.api = api
}
