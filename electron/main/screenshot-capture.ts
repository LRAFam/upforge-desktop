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

const GET_SOURCES_TIMEOUT_MS = 10_000

type CaptureSources = Awaited<ReturnType<typeof desktopCapturer.getSources>>

function getScreenSources(width: number, height: number): Promise<CaptureSources> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Screen capture timed out')), GET_SOURCES_TIMEOUT_MS)
  })
  const request = desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width, height } })
  // If the timeout wins, a late rejection from Electron must not surface as unhandled.
  request.catch(() => {})
  return Promise.race([request, timeout]).finally(() => clearTimeout(timer))
}

/**
 * Enumerate screens, retrying once with a different thumbnail size.
 * Electron dedupes in-flight getSources calls by their options; a request that fails
 * synchronously stays in that cache, so retrying with the same options returns the same
 * rejected promise. A 1 px smaller thumbnail is a fresh request.
 */
async function getScreenSourcesWithRetry(width: number, height: number): Promise<CaptureSources> {
  try {
    return await getScreenSources(width, height)
  } catch (err) {
    log.warn('[Screenshots] getSources failed, retrying once:', err)
    return getScreenSources(width, Math.max(1, height - 1))
  }
}

/** Capture primary screen and save to userData/screenshots (callable from main process hotkeys). */
export async function captureAndSaveScreenshot(): Promise<ScreenshotCaptureResult> {
  try {
    const display = screen.getPrimaryDisplay()
    const width = Math.round(display.size.width * display.scaleFactor)
    const height = Math.round(display.size.height * display.scaleFactor)
    const sources = await getScreenSourcesWithRetry(width, height)
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
