import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import log from 'electron-log'

export function candidateObsPaths(): string[] {
  if (process.platform === 'darwin') {
    return ['/Applications/OBS.app']
  }
  if (process.platform === 'win32') {
    const roots = [
      process.env.ProgramFiles,
      process.env['ProgramFiles(x86)'],
      process.env.LocalAppData,
    ].filter(Boolean) as string[]
    const paths: string[] = []
    for (const root of roots) {
      paths.push(join(root, 'obs-studio', 'bin', '64bit', 'obs64.exe'))
      paths.push(join(root, 'Programs', 'obs-studio', 'bin', '64bit', 'obs64.exe'))
    }
    return paths
  }
  return ['/usr/bin/obs', '/usr/local/bin/obs', '/snap/bin/obs']
}

export function isObsInstalled(): boolean {
  return candidateObsPaths().some((p) => existsSync(p))
}

export interface ObsInstallResult {
  ok: boolean
  installed?: boolean
  error?: string
}

/** Silent OBS Studio install via winget (Windows only). No-op if already installed. */
export async function installObsViaWinget(): Promise<ObsInstallResult> {
  if (process.platform !== 'win32') {
    return { ok: false, error: 'OBS auto-install is only supported on Windows' }
  }
  if (isObsInstalled()) {
    return { ok: true, installed: false }
  }

  log.info('[OBS Installer] OBS not found — running winget install OBSProject.OBSStudio')

  return new Promise((resolve) => {
    const child = spawn(
      'winget',
      [
        'install',
        '--id',
        'OBSProject.OBSStudio',
        '-e',
        '--accept-package-agreements',
        '--accept-source-agreements',
        '--silent',
        '--disable-interactivity',
      ],
      { shell: true, stdio: ['ignore', 'pipe', 'pipe'] },
    )

    let stderr = ''
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    const timeout = setTimeout(() => {
      child.kill()
      resolve({ ok: false, error: 'OBS install timed out — install manually from obsproject.com' })
    }, 180_000)

    child.on('error', (err) => {
      clearTimeout(timeout)
      log.warn('[OBS Installer] winget spawn failed:', err)
      resolve({
        ok: false,
        error: 'winget not available — install OBS Studio from obsproject.com',
      })
    })

    child.on('close', (code) => {
      clearTimeout(timeout)
      if (code === 0 || isObsInstalled()) {
        log.info('[OBS Installer] winget install completed')
        resolve({ ok: true, installed: true })
        return
      }
      log.warn('[OBS Installer] winget exit', code, stderr)
      resolve({
        ok: false,
        error: 'Could not install OBS automatically — download from obsproject.com',
      })
    })
  })
}
