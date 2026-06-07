import { app, desktopCapturer } from 'electron'
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
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 3840, height: 2160 },
    })
    if (!sources.length) return { ok: false, error: 'no_sources' }

    const screenshotsDir = path.join(app.getPath('userData'), 'screenshots')
    if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true })

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
    const filename = `screenshot_${timestamp}.png`
    const filepath = path.join(screenshotsDir, filename)

    const dataUrl = sources[0].thumbnail.toDataURL()
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '')
    fs.writeFileSync(filepath, Buffer.from(base64, 'base64'))
    log.info('[Screenshots] Saved:', filepath)
    return { ok: true, filename, path: filepath }
  } catch (err) {
    log.warn('[Screenshots] capture failed:', err)
    return { ok: false, error: String(err) }
  }
}
