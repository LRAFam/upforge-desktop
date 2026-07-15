import { app, desktopCapturer, screen } from 'electron'
import fs from 'fs'
import path from 'path'
import log from 'electron-log'

export interface ScreenshotCaptureResult {
  ok: boolean
  filename?: string
  path?: string
  error?: string
}

/** Capture primary screen and save to userData/screenshots (callable from main process hotkeys). */
export async function captureAndSaveScreenshot(): Promise<ScreenshotCaptureResult> {
  try {
    const display = screen.getPrimaryDisplay()
    const width = Math.round(display.size.width * display.scaleFactor)
    const height = Math.round(display.size.height * display.scaleFactor)
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width, height },
    })
    if (!sources.length) return { ok: false, error: 'no_sources' }

    const screenshotsDir = path.join(app.getPath('userData'), 'screenshots')
    await fs.promises.mkdir(screenshotsDir, { recursive: true })

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
    const filename = `screenshot_${timestamp}.png`
    const filepath = path.join(screenshotsDir, filename)

    await fs.promises.writeFile(filepath, sources[0].thumbnail.toPNG())
    log.info('[Screenshots] Saved:', filepath)
    return { ok: true, filename, path: filepath }
  } catch (err) {
    log.warn('[Screenshots] capture failed:', err)
    return { ok: false, error: String(err) }
  }
}
