import { exec, spawn } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { join, win32 } from 'path'
import { promisify } from 'util'
import log from 'electron-log'

const execAsync = promisify(exec)

/** OBS paths found outside the default folders (registry, Steam, running process). */
let discoveredObsPaths: string[] = []

function defaultObsPaths(): string[] {
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

export function candidateObsPaths(): string[] {
  const paths = [...discoveredObsPaths, ...defaultObsPaths()]
  return paths.filter((p, i) => paths.indexOf(p) === i)
}

/** obs64.exe inside an OBS install folder (the folder that holds bin\64bit). */
export function obsExeInInstallDir(dir: string): string {
  return win32.join(dir, 'bin', '64bit', 'obs64.exe')
}

/** Value of `name` (or the default value when name is null) from `reg query` output. */
export function parseRegValue(stdout: string, name: string | null): string | null {
  // The default value's label is localised ("(Default)", "(Standard)", …).
  const label = name === null ? '\\([^)\\r\\n]*\\)' : name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`^\\s*${label}\\s+REG_(?:EXPAND_)?SZ\\s+(.+?)\\s*$`, 'im').exec(stdout)
  return m?.[1]?.trim() || null
}

/** Strip quotes and a trailing ",0" icon index from DisplayIcon / UninstallString values. */
function cleanRegPath(value: string): string {
  return value.replace(/,\s*-?\d+$/, '').replace(/^"|"$/g, '').trim()
}

/** Install folders named by the OBS registry keys (installer + uninstall entry). */
export function obsInstallDirsFromRegistry(outputs: { key: string; stdout: string }[]): string[] {
  const dirs: string[] = []
  for (const { key, stdout } of outputs) {
    if (/\\Uninstall\\/i.test(key)) {
      const loc = parseRegValue(stdout, 'InstallLocation')
      if (loc) dirs.push(cleanRegPath(loc))
      const uninstall = parseRegValue(stdout, 'UninstallString')
      if (uninstall) dirs.push(win32.dirname(cleanRegPath(uninstall)))
      const icon = parseRegValue(stdout, 'DisplayIcon')
      if (icon) {
        const exe = cleanRegPath(icon)
        // DisplayIcon is usually ...\bin\64bit\obs64.exe
        dirs.push(/\\bin\\64bit\\[^\\]+$/i.test(exe) ? win32.dirname(win32.dirname(win32.dirname(exe))) : win32.dirname(exe))
      }
    } else {
      const def = parseRegValue(stdout, null)
      if (def) dirs.push(cleanRegPath(def))
    }
  }
  return dirs.filter((d, i) => d && dirs.indexOf(d) === i)
}

/** Parse "path" entries from Steam's libraryfolders.vdf. */
export function parseSteamLibraryFolders(vdf: string): string[] {
  const out: string[] = []
  const re = /"path"\s+"([^"]+)"/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(vdf)) !== null) out.push(m[1].replace(/\\\\/g, '\\'))
  return out
}

/** OBS Studio on Steam installs to steamapps\common\OBS Studio in any Steam library. */
export function steamObsExePaths(steamRoot: string, libraryVdf: string | null): string[] {
  const libs = [steamRoot, ...(libraryVdf ? parseSteamLibraryFolders(libraryVdf) : [])]
  return libs.map((lib) => obsExeInInstallDir(win32.join(lib, 'steamapps', 'common', 'OBS Studio')))
}

/** Executable paths of running OBS processes, one per line of PowerShell output. */
export function parseRunningObsPaths(stdout: string): string[] {
  return stdout.split(/\r?\n/).map((l) => l.trim()).filter((l) => /\.exe$/i.test(l))
}

const OBS_REG_KEYS = [
  'HKLM\\SOFTWARE\\OBS Studio',
  'HKLM\\SOFTWARE\\WOW6432Node\\OBS Studio',
  'HKCU\\SOFTWARE\\OBS Studio',
  'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\OBS Studio',
  'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\OBS Studio',
  'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\OBS Studio',
]
const STEAM_REG_KEYS = ['HKCU\\Software\\Valve\\Steam', 'HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', 'HKLM\\SOFTWARE\\Valve\\Steam']

async function run(cmd: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync(cmd, { windowsHide: true, timeout: 5000 })
    return stdout
  } catch {
    return null
  }
}

/**
 * Look for OBS outside the default folders: the installer's registry keys, the
 * uninstall entry, every Steam library, and any running OBS process. Found
 * paths are remembered so candidateObsPaths() / isObsInstalled() see them.
 * Windows only; never throws.
 */
export async function discoverObsInstallPaths(): Promise<string[]> {
  if (process.platform !== 'win32') return []
  const found: string[] = []
  try {
    const regOutputs: { key: string; stdout: string }[] = []
    for (const key of OBS_REG_KEYS) {
      const stdout = await run(`reg query "${key}"`)
      if (stdout) regOutputs.push({ key, stdout })
    }
    found.push(...obsInstallDirsFromRegistry(regOutputs).map(obsExeInInstallDir))

    for (const key of STEAM_REG_KEYS) {
      const stdout = await run(`reg query "${key}"`)
      const steamRoot = stdout ? (parseRegValue(stdout, 'SteamPath') ?? parseRegValue(stdout, 'InstallPath')) : null
      if (!steamRoot) continue
      let vdf: string | null = null
      try { vdf = readFileSync(join(steamRoot, 'steamapps', 'libraryfolders.vdf'), 'utf-8') } catch { /* no extra libraries */ }
      found.push(...steamObsExePaths(steamRoot.replace(/\//g, '\\'), vdf))
      break
    }

    const running = await run(
      'powershell.exe -NoProfile -NonInteractive -Command "Get-Process -Name obs64,obs32 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Path"',
    )
    if (running) found.push(...parseRunningObsPaths(running))
  } catch (err) {
    log.warn('[OBS Installer] OBS path discovery failed:', err instanceof Error ? err.message : String(err))
  }
  const existing = found.filter((p, i) => found.indexOf(p) === i && existsSync(p))
  if (existing.length) log.info('[OBS Installer] Found OBS at', existing.join(', '))
  discoveredObsPaths = existing
  return existing
}

export function isObsInstalled(): boolean {
  return candidateObsPaths().some((p) => existsSync(p))
}

export const WINGET_TIMEOUT_MS = 10 * 60_000

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
  // OBS may live in a custom folder or a Steam library: look before installing a second copy.
  await discoverObsInstallPaths()
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

    // OBS is a large download; slow connections need longer than a few minutes.
    const timeout = setTimeout(() => {
      child.kill()
      if (isObsInstalled()) {
        resolve({ ok: true, installed: true })
        return
      }
      resolve({ ok: false, error: 'OBS install is taking too long — install OBS Studio from obsproject.com' })
    }, WINGET_TIMEOUT_MS)

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
