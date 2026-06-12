import { app, shell } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import log from 'electron-log'

function candidateObsPaths(): string[] {
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

/** Open OBS Studio if installed in a standard location. */
export async function launchObsStudio(): Promise<{ ok: boolean; error?: string }> {
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
