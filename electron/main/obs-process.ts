import { exec } from 'child_process'
import { promisify } from 'util'
import log from 'electron-log'
import { clearObsCrashSentinel } from './obs-crash-sentinel'

const execAsync = promisify(exec)

const OBS_WIN_FOUND_MARKER = 'UPFORGE_OBS_PROCESS_FOUND'

/** How long OBS gets to shut itself down before we force it. */
const GRACEFUL_EXIT_TIMEOUT_MS = 8000
const GRACEFUL_POLL_MS = 500

export interface ObsProcessState {
  installed: boolean
  processRunning: boolean
}

export interface ObsTerminateCommands {
  graceful: string
  force: string
}

/**
 * Match both known OBS executable names and the "OBS Studio" product/file
 * description shown by Windows Task Manager. The metadata check also catches
 * renamed or alternate OBS builds instead of assuming every task is obs64.exe.
 */
function windowsObsProcessesScript(action: string): string {
  const findObs = "$obs = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $knownName = $_.ProcessName -in @('obs64','obs32'); $studioMetadata = $false; try { $info = $_.MainModule.FileVersionInfo; $studioMetadata = $info.ProductName -eq 'OBS Studio' -or $info.FileDescription -eq 'OBS Studio' } catch {}; $knownName -or $studioMetadata })"
  return `powershell.exe -NoProfile -NonInteractive -Command "${findObs}; ${action}"`
}

/**
 * A graceful close lets OBS clear its crash sentinel, which keeps the next
 * launch from stalling on the Safe Mode prompt.
 */
export function obsTerminateCommands(platform: NodeJS.Platform = process.platform): ObsTerminateCommands {
  if (platform === 'win32') {
    // /T covers browser sources and crash helpers that can block relaunch.
    return {
      graceful: windowsObsProcessesScript("$obs | ForEach-Object { & taskkill.exe /PID $_.Id /T }"),
      force: windowsObsProcessesScript("$obs | ForEach-Object { & taskkill.exe /PID $_.Id /F /T }"),
    }
  }
  if (platform === 'darwin') {
    return {
      graceful: 'pkill -x OBS || pkill -f "OBS.app" || true',
      force: 'pkill -9 -x OBS || pkill -9 -f "OBS.app" || true',
    }
  }
  return {
    graceful: 'pkill -x obs || pkill -f obs-studio || true',
    force: 'pkill -9 -x obs || pkill -9 -f obs-studio || true',
  }
}

export async function isObsProcessRunning(): Promise<boolean> {
  if (process.platform === 'win32') {
    try {
      const command = windowsObsProcessesScript(`if ($obs.Count -gt 0) { Write-Output '${OBS_WIN_FOUND_MARKER}' }`)
      const { stdout } = await execAsync(command)
      return stdout.includes(OBS_WIN_FOUND_MARKER)
    } catch {
      return false
    }
  }
  if (process.platform === 'darwin') {
    try {
      const { stdout } = await execAsync('pgrep -x OBS || true')
      return stdout.trim().length > 0
    } catch {
      return false
    }
  }
  try {
    const { stdout } = await execAsync('pgrep -x obs || pgrep -f obs-studio || true')
    return stdout.trim().length > 0
  } catch {
    return false
  }
}

async function waitForObsExit(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await sleep(GRACEFUL_POLL_MS)
    if (!(await isObsProcessRunning())) return true
  }
  return !(await isObsProcessRunning())
}

export async function terminateObsProcess(): Promise<{ ok: boolean; error?: string }> {
  if (!(await isObsProcessRunning())) {
    return { ok: true }
  }

  const manualHint = process.platform === 'win32'
    ? 'Could not close OBS. End every OBS Studio task in Task Manager, including background tasks, then try again.'
    : 'Could not close OBS. Quit OBS manually, then try again.'

  const commands = obsTerminateCommands()

  try {
    await execAsync(commands.graceful).catch(() => undefined)
    if (await waitForObsExit(GRACEFUL_EXIT_TIMEOUT_MS)) {
      log.info('[OBS Process] OBS closed gracefully')
      return { ok: true }
    }

    log.warn('[OBS Process] OBS ignored the close request, forcing it')
    await execAsync(commands.force).catch(() => undefined)
    await sleep(1500)
    if (await isObsProcessRunning()) {
      log.warn('[OBS Process] Still running after terminate attempts')
      return { ok: false, error: manualHint }
    }
    // A forced exit leaves the sentinel behind, which triggers OBS Safe Mode next launch.
    clearObsCrashSentinel()
    log.info('[OBS Process] Terminated hung OBS process')
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log.warn('[OBS Process] terminate failed:', message)
    // taskkill returns non-zero when the process already exited — treat as success.
    if (!(await isObsProcessRunning())) {
      return { ok: true }
    }
    return { ok: false, error: manualHint }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export { sleep as obsProcessSleep }
