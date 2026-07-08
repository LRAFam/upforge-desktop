import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import log from 'electron-log'

const execAsync = promisify(exec)
const IS_WIN = process.platform === 'win32'

export interface CS2DemoResult {
  found: boolean
  demoPath: string | null
  demoDir: string | null
  error?: string
}

/** Parse "path" entries from a Steam libraryfolders.vdf file. */
function parseLibraryFolders(vdfPath: string): string[] {
  try {
    const content = fs.readFileSync(vdfPath, 'utf-8')
    const paths: string[] = []
    // Match lines like:   "path"   "C:\\SteamLibrary"
    const re = /"path"\s+"([^"]+)"/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(content)) !== null) {
      paths.push(m[1].replace(/\\\\/g, '\\'))
    }
    return paths
  } catch {
    return []
  }
}

/** Find the Steam installation path from the Windows registry. */
async function getSteamPath(): Promise<string | null> {
  try {
    const { stdout } = await execAsync(
      'reg query "HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam" /v InstallPath',
      { windowsHide: true, timeout: 5000 }
    )
    const match = /InstallPath\s+REG_SZ\s+(.+)/i.exec(stdout)
    if (match) return match[1].trim()
  } catch {
    // Try the 32-bit key as fallback
    try {
      const { stdout } = await execAsync(
        'reg query "HKLM\\SOFTWARE\\Valve\\Steam" /v InstallPath',
        { windowsHide: true, timeout: 5000 }
      )
      const match = /InstallPath\s+REG_SZ\s+(.+)/i.exec(stdout)
      if (match) return match[1].trim()
    } catch {
      return null
    }
  }
  return null
}

const CS2_GAME_CSGO_REL = path.join(
  'steamapps',
  'common',
  'Counter-Strike Global Offensive',
  'game',
  'csgo',
)
const CS2_LEGACY_CSGO_REL = path.join(
  'steamapps',
  'common',
  'Counter-Strike Global Offensive',
  'csgo',
)

function cs2CsgoDirsForSteamRoot(steamRoot: string): string[] {
  return [
    path.join(steamRoot, CS2_GAME_CSGO_REL),
    path.join(steamRoot, CS2_LEGACY_CSGO_REL),
  ]
}

/** Build the list of candidate CS2 demo directories across all Steam libraries. */
async function getCandidateDemoDirs(steamPath: string): Promise<string[]> {
  const dirs = cs2CsgoDirsForSteamRoot(steamPath)

  const vdfPath = path.join(steamPath, 'steamapps', 'libraryfolders.vdf')
  const extraLibs = parseLibraryFolders(vdfPath)
  for (const lib of extraLibs) {
    dirs.push(...cs2CsgoDirsForSteamRoot(lib))
  }

  return dirs
}

/**
 * All CS2 csgo roots that exist on disk (game/csgo and legacy csgo).
 * GSI cfg must be installed in each cfg/ folder — some installs only load one path.
 */
export async function getCandidateCS2CsgoDirs(): Promise<string[]> {
  if (!IS_WIN) return []

  const steamPath = await getSteamPath()
  if (!steamPath) return []

  const seen = new Set<string>()
  const existing: string[] = []
  for (const dir of await getCandidateDemoDirs(steamPath)) {
    if (seen.has(dir) || !fs.existsSync(dir)) continue
    seen.add(dir)
    existing.push(dir)
  }
  return existing
}

/**
 * Detect the CS2 demo directory (for use in the Settings UI).
 * Returns null on non-Windows or if Steam/CS2 is not found.
 */
export async function detectCS2DemoDir(): Promise<string | null> {
  if (!IS_WIN) return null

  const steamPath = await getSteamPath()
  if (!steamPath) {
    log.info('[CS2Demo] Steam installation not found in registry')
    return null
  }

  const candidates = await getCandidateDemoDirs(steamPath)
  for (const dir of candidates) {
    if (fs.existsSync(dir)) {
      log.info(`[CS2Demo] Detected demo dir: ${dir}`)
      return dir
    }
  }

  log.info('[CS2Demo] No CS2 demo directory found across Steam libraries')
  return null
}

/**
 * Find the most recently written .dem file created after the match started.
 * Polls for up to 15 seconds in case CS2 is still writing the file.
 */
export async function findLatestCS2Demo(
  matchStartTime: number,
  customDemoDir?: string
): Promise<CS2DemoResult> {
  if (!IS_WIN) {
    return { found: false, demoPath: null, demoDir: null }
  }

  const notBefore = matchStartTime - 60_000 // 60s buffer

  let demoDir: string | null = null

  if (customDemoDir) {
    demoDir = customDemoDir
    log.info(`[CS2Demo] Using custom demo dir: ${demoDir}`)
  } else {
    const steamPath = await getSteamPath()
    if (!steamPath) {
      log.warn('[CS2Demo] Steam not found — cannot locate demo dir')
      return { found: false, demoPath: null, demoDir: null, error: 'Steam not found' }
    }

    const candidates = await getCandidateDemoDirs(steamPath)
    log.info(`[CS2Demo] Checking ${candidates.length} candidate demo dirs`)
    for (const dir of candidates) {
      if (fs.existsSync(dir)) {
        demoDir = dir
        log.info(`[CS2Demo] Using demo dir: ${demoDir}`)
        break
      }
    }
  }

  if (!demoDir) {
    log.warn('[CS2Demo] CS2 demo directory not found')
    return { found: false, demoPath: null, demoDir: null, error: 'CS2 directory not found' }
  }

  // Poll for up to 15 seconds (2s intervals) for a .dem file to appear
  const MAX_WAIT_MS = 15_000
  const POLL_INTERVAL_MS = 2_000
  const deadline = Date.now() + MAX_WAIT_MS

  log.info(`[CS2Demo] Polling for .dem files modified after ${new Date(notBefore).toISOString()}`)

  while (Date.now() < deadline) {
    const demo = findNewestDem(demoDir, notBefore)
    if (demo) {
      log.info(`[CS2Demo] Found demo: ${demo}`)
      return { found: true, demoPath: demo, demoDir }
    }
    log.info(`[CS2Demo] No demo found yet, waiting ${POLL_INTERVAL_MS}ms...`)
    await sleep(POLL_INTERVAL_MS)
  }

  log.info('[CS2Demo] No demo file found within 15s')
  return { found: false, demoPath: null, demoDir }
}

function findNewestDem(dir: string, notBefore: number): string | null {
  try {
    const entries = fs.readdirSync(dir)
    let newest: { path: string; mtimeMs: number } | null = null

    for (const entry of entries) {
      if (!entry.toLowerCase().endsWith('.dem')) continue
      const fullPath = path.join(dir, entry)
      try {
        const stat = fs.statSync(fullPath)
        if (stat.mtimeMs < notBefore) continue
        if (!newest || stat.mtimeMs > newest.mtimeMs) {
          newest = { path: fullPath, mtimeMs: stat.mtimeMs }
        }
      } catch {
        // Skip unreadable files
      }
    }

    return newest?.path ?? null
  } catch {
    return null
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export interface CS2DemoFile {
  name: string
  path: string
  sizeBytes: number
  modifiedAt: number
}

/** List the most recent .dem files in the CS2 demo directory. */
export async function listRecentCS2Demos(
  customDemoDir?: string,
  limit = 8,
): Promise<{ files: CS2DemoFile[]; dir: string | null; exists: boolean }> {
  if (!IS_WIN) {
    return { files: [], dir: null, exists: false }
  }

  let demoDir: string | null = customDemoDir ?? null
  if (!demoDir) {
    const steamPath = await getSteamPath()
    if (steamPath) {
      const candidates = await getCandidateDemoDirs(steamPath)
      for (const dir of candidates) {
        if (fs.existsSync(dir)) {
          demoDir = dir
          break
        }
      }
    }
  }

  if (!demoDir || !fs.existsSync(demoDir)) {
    return { files: [], dir: demoDir, exists: false }
  }

  const files: CS2DemoFile[] = []
  try {
    for (const entry of fs.readdirSync(demoDir)) {
      if (!entry.toLowerCase().endsWith('.dem')) continue
      const fullPath = path.join(demoDir, entry)
      try {
        const stat = fs.statSync(fullPath)
        files.push({
          name: entry,
          path: fullPath,
          sizeBytes: stat.size,
          modifiedAt: stat.mtimeMs,
        })
      } catch {
        // skip unreadable
      }
    }
  } catch {
    return { files: [], dir: demoDir, exists: true }
  }

  files.sort((a, b) => b.modifiedAt - a.modifiedAt)
  return { files: files.slice(0, limit), dir: demoDir, exists: true }
}
