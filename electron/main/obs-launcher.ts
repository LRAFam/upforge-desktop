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

/** Spawn a detached process and resolve only after spawn succeeds or error is emitted. */
function spawnDetached(
  exe: string,
  args: string[],
  opts: { shell?: boolean } = {},
): Promise<{ ok: boolean; error?: string; code?: string }> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (result: { ok: boolean; error?: string; code?: string }) => {
      if (settled) return
      settled = true
      resolve(result)
    }

    try {
      const child = spawn(exe, args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        shell: opts.shell ?? false,
      })
      child.once('error', (err: NodeJS.ErrnoException) => {
        log.warn('[OBS Launcher] spawn error event:', err.message)
        finish({ ok: false, error: err.message, code: err.code })
      })
      child.once('spawn', () => {
        child.unref()
        finish({ ok: true })
      })
    } catch (err) {
      const e = err as NodeJS.ErrnoException
      finish({ ok: false, error: e.message, code: e.code })
    }
  })
}

/** Windows fallback when direct spawn is blocked (EACCES / antivirus / Program Files ACL). */
async function launchObsViaCmdStart(candidate: string, wsArgs: string[]): Promise<{ ok: boolean; error?: string }> {
  const args = ['--minimize-to-tray', ...wsArgs]
  log.info('[OBS Launcher] Trying cmd start fallback:', candidate)
  const result = await spawnDetached('cmd.exe', ['/c', 'start', '""', '/min', candidate, ...args])
  if (result.ok) return { ok: true }
  return { ok: false, error: result.error ?? 'cmd start failed' }
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

      let result = await spawnDetached(candidate, ['--minimize-to-tray', ...wsArgs])
      if (!result.ok && (result.code === 'EACCES' || result.code === 'EPERM')) {
        result = await launchObsViaCmdStart(candidate, wsArgs)
      }
      if (result.ok) return { ok: true }

      log.warn('[OBS Launcher] spawn failed for', candidate, result.error)
      if (result.code === 'EACCES' || result.code === 'EPERM') {
        return {
          ok: false,
          error:
            'Windows blocked UpForge from launching OBS. Open OBS manually, or allow UpForge in your antivirus / run UpForge as administrator.',
        }
      }
    }
  }

  if (process.platform === 'darwin') {
    if (existsSync('/Applications/OBS.app')) {
      const result = await spawnDetached('open', ['-a', 'OBS', '--args', ...wsArgs])
      if (result.ok) return { ok: true }
      log.warn('[OBS Launcher] open -a OBS failed:', result.error)
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
