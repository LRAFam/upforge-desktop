/**
 * Install bundled UpForge OBS profile + WebSocket defaults (Windows/macOS AppData).
 */

import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import log from 'electron-log'

export const UPFORGE_OBS_PROFILE_NAME = 'UpForge'
export const UPFORGE_OBS_DEFAULT_PASSWORD = 'upforge'
export const UPFORGE_OBS_DEFAULT_PORT = 4455

const INSTALL_MARKER = '.upforge-installed'
/** Bump when bundled basic.ini changes materially — forces merge into existing installs. */
const PROFILE_SYNC_VERSION = '2'

function obsAppDataDir(): string | null {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA
    return appData ? path.join(appData, 'obs-studio') : null
  }
  if (process.platform === 'darwin') {
    return path.join(app.getPath('home'), 'Library', 'Application Support', 'obs-studio')
  }
  return null
}

function bundledObsRoot(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'obs')
  }
  return path.join(app.getAppPath(), 'resources', 'obs')
}

function writeJsonIfChanged(filePath: string, data: Record<string, unknown>): boolean {
  const next = JSON.stringify(data, null, 2)
  try {
    if (fs.existsSync(filePath)) {
      const current = fs.readFileSync(filePath, 'utf-8')
      if (current === next) return false
    }
  } catch { /* rewrite */ }
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, next, 'utf-8')
  return true
}

function copyFileIfMissing(src: string, dest: string): boolean {
  if (!fs.existsSync(src)) return false
  if (fs.existsSync(dest)) return false
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(src, dest)
  return true
}

function mergeBundledProfileKeys(bundledIni: string, destIni: string): boolean {
  if (!fs.existsSync(destIni)) return false
  const keysToSync: Array<[string, string, string]> = [
    ['SimpleOutput', 'RecFormat', 'mp4'],
    ['SimpleOutput', 'RecQuality', 'Small'],
    ['Output', 'Mode', 'Simple'],
  ]
  let current = fs.readFileSync(destIni, 'utf-8')
  let changed = false
  for (const [section, key, value] of keysToSync) {
    const sectionRe = new RegExp(`\\[${section}\\][\\s\\S]*?(?=\\n\\[|$)`)
    const match = current.match(sectionRe)
    if (!match) continue
    const lineRe = new RegExp(`^${key}=.*$`, 'm')
    const nextSection = match[0].includes(`${key}=`)
      ? match[0].replace(lineRe, `${key}=${value}`)
      : `${match[0].trimEnd()}\n${key}=${value}\n`
    if (nextSection !== match[0]) {
      current = current.replace(sectionRe, nextSection)
      changed = true
    }
  }
  if (changed) {
    fs.writeFileSync(destIni, current, 'utf-8')
    log.info('[OBS Profile] Synced recording keys into existing profile')
  }
  return changed
}

export interface ObsProfileInstallResult {
  ok: boolean
  installed: boolean
  error?: string
  profilePath?: string
  websocketConfigured?: boolean
}

/** Copy UpForge OBS profile + enable WebSocket on loopback with known default password. */
export function ensureObsProfileInstalled(
  password = UPFORGE_OBS_DEFAULT_PASSWORD,
  port = UPFORGE_OBS_DEFAULT_PORT,
): ObsProfileInstallResult {
  const obsRoot = obsAppDataDir()
  if (!obsRoot) {
    return { ok: false, installed: false, error: 'OBS AppData folder not found on this platform' }
  }

  let installed = false
  const bundledRoot = bundledObsRoot()
  const profileSrc = path.join(bundledRoot, 'upforge-profile', 'basic.ini')
  const profileDestDir = path.join(obsRoot, 'basic', 'profiles', UPFORGE_OBS_PROFILE_NAME)
  const profileDest = path.join(profileDestDir, 'basic.ini')
  const markerPath = path.join(profileDestDir, INSTALL_MARKER)

  try {
    if (copyFileIfMissing(profileSrc, profileDest)) {
      installed = true
      log.info('[OBS Profile] Installed profile at', profileDest)
    }

    const versionMarker = path.join(profileDestDir, `${INSTALL_MARKER}-v${PROFILE_SYNC_VERSION}`)
    if (!fs.existsSync(versionMarker)) {
      if (fs.existsSync(profileSrc) && fs.existsSync(profileDest)) {
        const bundledIni = fs.readFileSync(profileSrc, 'utf-8')
        if (mergeBundledProfileKeys(bundledIni, profileDest)) installed = true
      }
      fs.mkdirSync(profileDestDir, { recursive: true })
      fs.writeFileSync(versionMarker, new Date().toISOString(), 'utf-8')
    }

    if (!fs.existsSync(markerPath)) {
      fs.mkdirSync(profileDestDir, { recursive: true })
      fs.writeFileSync(markerPath, new Date().toISOString(), 'utf-8')
      installed = true
    }

    const wsConfigPath = path.join(obsRoot, 'plugin_config', 'obs-websocket', 'config.json')
    const wsChanged = writeJsonIfChanged(wsConfigPath, {
      alerts_enabled: false,
      auth_required: true,
      first_load: false,
      server_enabled: true,
      server_password: password,
      server_port: port,
    })
    if (wsChanged) {
      installed = true
      log.info('[OBS Profile] Updated WebSocket config at', wsConfigPath)
    }

    return {
      ok: true,
      installed,
      profilePath: profileDestDir,
      websocketConfigured: true,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.warn('[OBS Profile] Install failed:', msg)
    return { ok: false, installed: false, error: msg }
  }
}

export function resolveObsWebSocketPassword(configured: string | undefined | null): string {
  const trimmed = (configured ?? '').trim()
  return trimmed || UPFORGE_OBS_DEFAULT_PASSWORD
}

export function obsLaunchArgs(password: string, port = UPFORGE_OBS_DEFAULT_PORT): string[] {
  const args: string[] = []
  if (password) args.push(`--websocket_password=${password}`)
  if (port > 0) args.push(`--websocket_port=${port}`)
  return args
}
