import { dialog, shell } from 'electron'
import { existsSync, mkdirSync } from 'fs'
import log from 'electron-log'
import { redactSensitiveString } from './error-redaction'

/** Call only after the caller's URL policy has accepted the link. */
export async function openExternalSafe(url: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await shell.openExternal(url)
    return { ok: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log.warn('[openExternalSafe] Could not open browser:', redactSensitiveString(message))
    const recovery = 'Choose a default browser in your system settings, then try again.'
    try {
      await dialog.showMessageBox({
        type: 'warning',
        title: 'Could not open link',
        message: 'UpForge could not open your browser.',
        detail: recovery,
        buttons: ['OK'],
      })
    } catch { /* A failed notification must not become an unhandled rejection. */ }
    return { ok: false, error: recovery }
  }
}

/**
 * Open a folder in the OS file manager without surfacing unhandled rejections.
 * Optionally creates the directory first (clips / recordings paths we own).
 */
export async function openPathSafe(
  targetPath: string,
  opts: { createIfMissing?: boolean } = {},
): Promise<{ ok: boolean; error?: string }> {
  if (!targetPath?.trim()) {
    return { ok: false, error: 'Path is empty' }
  }

  try {
    if (opts.createIfMissing && !existsSync(targetPath)) {
      mkdirSync(targetPath, { recursive: true })
    }
    if (!existsSync(targetPath)) {
      return { ok: false, error: 'Folder does not exist yet' }
    }

    const err = await shell.openPath(targetPath)
    if (err) {
      log.warn('[openPathSafe] Failed to open:', targetPath, err)
      return { ok: false, error: err }
    }
    return { ok: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log.warn('[openPathSafe] Error opening path:', targetPath, message)
    return { ok: false, error: message }
  }
}
