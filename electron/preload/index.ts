import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  auth: {
    login: (email: string, password: string) =>
      ipcRenderer.invoke('auth:login', { email, password }),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getUser: () => ipcRenderer.invoke('auth:get-user'),
    loadStored: () => ipcRenderer.invoke('auth:load-stored')
  },
  app: {
    getStatus: () => ipcRenderer.invoke('app:get-status')
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
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    const allowed = [
      'post-game:upload-start',
      'post-game:upload-progress',
      'post-game:upload-complete',
      'post-game:analysis-ready',
      'post-game:upload-error',
      'dashboard:refresh'
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
  contextBridge.exposeInMainWorld('electron', electronAPI)
  contextBridge.exposeInMainWorld('api', api)
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
