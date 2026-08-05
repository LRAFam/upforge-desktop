import { exec } from 'child_process'
import { promisify } from 'util'
import log from 'electron-log'
import { clearObsCrashSentinel } from './obs-crash-sentinel'

const execAsync = promisify(exec)

const OBS_WIN_IMAGE = 'obs64.exe'

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
 * A graceful close lets OBS clear its crash sentinel, which keeps the next
 * launch from stalling on the Safe Mode prompt.
 */
export function obsTerminateCommands(platform: NodeJS.Platform = process.platform): ObsTerminateCommands {
  if (platform === 'win32') {
    // /T covers the process tree (browser sources, crash helpers) that can block relaunch.
    return {
      graceful: `taskkill /IM ${OBS_WIN_IMAGE} /T`,
      force: `taskkill /IM ${OBS_WIN_IMAGE} /F /T`,
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
      const { stdout } = await execAsync(`tasklist /fi "IMAGENAME eq ${OBS_WIN_IMAGE}" /fo csv /nh`)
      return stdout.toLowerCase().includes(OBS_WIN_IMAGE)
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
    ? 'Could not close OBS. Close OBS Studio yourself (check the system tray), then try again.'
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
