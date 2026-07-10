import type { BrowserWindow } from 'electron'
import type { ValveDemoDownloadProgress } from './valve-demo-download'

export function sendDemoDownloadProgress(
  windows: Array<BrowserWindow | null | undefined>,
  progress: ValveDemoDownloadProgress,
): void {
  const status = progress.phase === 'gc_lookup' ? 'gc_lookup' : 'downloading'
  for (const win of windows) {
    if (!win || win.isDestroyed()) continue
    try {
      win.webContents.send('post-game:demo-status', { status })
      win.webContents.send('post-game:demo-download-progress', progress)
      if (progress.pct != null) {
        win.webContents.send('post-game:demo-progress', progress.pct)
      }
    } catch { /* window closed */ }
  }
}

export function clearDemoDownloadProgress(
  windows: Array<BrowserWindow | null | undefined>,
): void {
  for (const win of windows) {
    if (!win || win.isDestroyed()) continue
    try {
      win.webContents.send('post-game:demo-download-progress', null)
    } catch { /* window closed */ }
  }
}
