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
  buildObsCmdStartArgs,
  obsExecutableWorkingDirectory,
} from './obs-launch-cwd'
import { clearObsCrashSentinel } from './obs-crash-sentinel'
import {
  obsLaunchArgs,
  UPFORGE_OBS_DEFAULT_PORT,
  UPFORGE_OBS_DEFAULT_PASSWORD,
} from './obs-profile-installer'
import { windowsObsProcessQuery } from './obs-process'

export interface LaunchObsOptions {
  password?: string
  port?: number
  /** Try winget install on Windows when OBS is missing (default true). */
  allowWingetInstall?: boolean
}

function powershellSingleQuoted(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

/** Build the elevated child script separately so quoting is covered by unit tests. */
export function buildElevatedObsScript(exe: string, args: string[]): string {
  const cwd = obsExecutableWorkingDirectory(exe)
  const argumentList = args.map(powershellSingleQuoted).join(', ')
  return [
    "$ErrorActionPreference = 'Stop'",
    windowsObsProcessQuery(),
    '$obs | Stop-Process -Force -ErrorAction SilentlyContinue',
    'Start-Sleep -Milliseconds 500',
    `Start-Process -FilePath ${powershellSingleQuoted(exe)} -WorkingDirectory ${powershellSingleQuoted(cwd)} -ArgumentList @(${argumentList})`,
  ].join('; ')
}

function runElevatedPowerShell(script: string): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (result: { ok: boolean; error?: string }) => {
      if (settled) return
      settled = true
      resolve(result)
    }
    const encodedScript = Buffer.from(script, 'utf16le').toString('base64')
    const elevateCommand = [
      "$ErrorActionPreference = 'Stop'",
      `$process = Start-Process -FilePath 'powershell.exe' -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList @('-NoProfile', '-NonInteractive', '-EncodedCommand', '${encodedScript}')`,
      'if ($process.ExitCode -ne 0) { exit $process.ExitCode }',
    ].join('; ')
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', elevateCommand], {
      stdio: 'ignore',
      windowsHide: true,
    })
    child.once('error', (err) => finish({ ok: false, error: err.message }))
    child.once('close', (code) => finish(code === 0
      ? { ok: true }
      : { ok: false, error: 'Administrator permission was cancelled or Windows could not restart OBS.' }))
  })
}

/** Spawn a detached process and resolve only after spawn succeeds or error is emitted. */
function spawnDetached(
  exe: string,
  args: string[],
  opts: { shell?: boolean; cwd?: string } = {},
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
        cwd: opts.cwd,
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
  const result = await spawnDetached('cmd.exe', buildObsCmdStartArgs(candidate, args))
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

  // We launch minimised to tray, so a Safe Mode prompt would be invisible and
  // would hold OBS before obs-websocket starts listening.
  clearObsCrashSentinel()

  if (process.platform === 'win32') {
    for (const candidate of candidateObsPaths()) {
      if (!existsSync(candidate)) continue
      const cwd = obsExecutableWorkingDirectory(candidate)
      log.info('[OBS Launcher] Spawning:', candidate, wsArgs.join(' '), `(cwd=${cwd})`)

      let result = await spawnDetached(candidate, ['--minimize-to-tray', ...wsArgs], { cwd })
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

/** Restart OBS with a visible Windows UAC prompt. Used only after capture failure. */
export async function restartObsStudioElevated(opts: LaunchObsOptions = {}): Promise<{ ok: boolean; error?: string }> {
  if (process.platform !== 'win32') {
    return { ok: false, error: 'Administrator restart is only available on Windows.' }
  }

  const password = opts.password ?? UPFORGE_OBS_DEFAULT_PASSWORD
  const port = opts.port ?? UPFORGE_OBS_DEFAULT_PORT
  const exe = candidateObsPaths().find(existsSync)
  if (!exe) return { ok: false, error: 'OBS Studio is not installed.' }

  clearObsCrashSentinel()
  log.info('[OBS Launcher] Requesting elevated OBS restart:', exe)
  return runElevatedPowerShell(buildElevatedObsScript(exe, [
    '--minimize-to-tray',
    ...obsLaunchArgs(password, port),
  ]))
}

/** First WebSocket probe after spawn — OBS needs time for plugins + websocket. */
export function obsLaunchDelayMs(): number {
  return app.isPackaged ? 8000 : 3500
}

export { installObsViaWinget, isObsInstalled }
