import { exec } from 'child_process'
import { promisify } from 'util'
import log from 'electron-log'

const execAsync = promisify(exec)

const OBS_WIN_IMAGE = 'obs64.exe'

export interface ObsProcessState {
  installed: boolean
  processRunning: boolean
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

export async function terminateObsProcess(): Promise<{ ok: boolean; error?: string }> {
  if (!(await isObsProcessRunning())) {
    return { ok: true }
  }

  const manualHint = process.platform === 'win32'
    ? 'Could not close OBS — end obs64.exe in Task Manager, then try again.'
    : 'Could not close OBS — quit OBS manually, then try again.'

  try {
    // /T kills the process tree (browser sources, crash helpers) that can block relaunch.
    if (process.platform === 'win32') {
      await execAsync(`taskkill /IM ${OBS_WIN_IMAGE} /F /T`).catch(() => undefined)
      await sleep(800)
      if (await isObsProcessRunning()) {
        await execAsync(`taskkill /IM ${OBS_WIN_IMAGE} /F /T`).catch(() => undefined)
      }
    } else if (process.platform === 'darwin') {
      await execAsync('pkill -x OBS || pkill -f "OBS.app" || true')
    } else {
      await execAsync('pkill -x obs || pkill -f obs-studio || true')
    }
    await sleep(1500)
    if (await isObsProcessRunning()) {
      log.warn('[OBS Process] Still running after terminate attempts')
      return { ok: false, error: manualHint }
    }
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
