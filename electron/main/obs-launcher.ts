import { app, shell } from 'electron'
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import log from 'electron-log'
import {
  candidateObsPaths,
  installObsViaWinget,
  isObsInstalled,
} from './obs-installer'
import {
  obsLaunchArgs,
  UPFORGE_OBS_DEFAULT_PORT,
  UPFORGE_OBS_DEFAULT_PASSWORD,
} from './obs-profile-installer'

export interface LaunchObsOptions {
  password?: string
  port?: number
  /** Try winget install on Windows when OBS is missing (default true). */
  allowWingetInstall?: boolean
}

/** Open OBS Studio if installed — passes WebSocket CLI overrides for reliable first connect. */
export async function launchObsStudio(opts: LaunchObsOptions = {}): Promise<{ ok: boolean; error?: string }> {
  const password = opts.password ?? UPFORGE_OBS_DEFAULT_PASSWORD
  const port = opts.port ?? UPFORGE_OBS_DEFAULT_PORT
  const wsArgs = obsLaunchArgs(password, port)
  const allowWingetInstall = opts.allowWingetInstall !== false

  if (process.platform === 'win32' && !isObsInstalled() && allowWingetInstall) {
    const installed = await installObsViaWinget()
    if (!installed.ok) {
      return { ok: false, error: installed.error }
    }
    if (installed.installed) {
      await new Promise((r) => setTimeout(r, 2500))
    }
  }

  if (process.platform === 'win32') {
    for (const candidate of candidateObsPaths()) {
      if (!existsSync(candidate)) continue
      log.info('[OBS Launcher] Spawning:', candidate, wsArgs.join(' '))
      try {
        const child = spawn(candidate, ['--minimize-to-tray', ...wsArgs], {
          detached: true,
          stdio: 'ignore',
          windowsHide: true,
        })
        child.unref()
        return { ok: true }
      } catch (err) {
        log.warn('[OBS Launcher] spawn failed:', err)
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  }

  if (process.platform === 'darwin') {
    if (existsSync('/Applications/OBS.app')) {
      try {
        spawn('open', ['-a', 'OBS', '--args', ...wsArgs], {
          detached: true,
          stdio: 'ignore',
        }).unref()
        return { ok: true }
      } catch (err) {
        log.warn('[OBS Launcher] open -a OBS failed:', err)
      }
    }
  }

  for (const candidate of candidateObsPaths()) {
    if (!existsSync(candidate)) continue
    log.info('[OBS Launcher] Opening:', candidate)
    const err = await shell.openPath(candidate)
    if (err) {
      log.warn('[OBS Launcher] openPath failed:', err)
      return { ok: false, error: err }
    }
    return { ok: true }
  }

  return {
    ok: false,
    error: process.platform === 'win32'
      ? 'OBS not found — install OBS Studio 28+ from obsproject.com'
      : 'OBS not found — install OBS Studio and try again',
  }
}

export function obsLaunchDelayMs(): number {
  return app.isPackaged ? 4500 : 2500
}

export { installObsViaWinget, isObsInstalled }
