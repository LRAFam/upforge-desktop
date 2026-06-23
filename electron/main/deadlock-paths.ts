/**
 * Deadlock install paths vary by build, language (citadel_de), mods (addons/replays),
 * and whether data lives under %LOCALAPPDATA% or the Steam game folder.
 */

import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)
const IS_WIN = process.platform === 'win32'
export const DEADLOCK_STEAM_APP_ID = '1422450'

const REPLAY_SUBDIRS = ['deadlock/replays', 'citadel/replays', 'citadel/addons/replays'] as const

function parseLibraryFolders(vdfPath: string): string[] {
  try {
    const content = fs.readFileSync(vdfPath, 'utf-8')
    const paths: string[] = []
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

async function getSteamPath(): Promise<string | null> {
  if (!IS_WIN) return null
  for (const key of [
    'HKCU\\Software\\Valve\\Steam',
    'HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam',
    'HKLM\\SOFTWARE\\Valve\\Steam',
  ]) {
    for (const valueName of ['SteamPath', 'InstallPath']) {
      try {
        const { stdout } = await execAsync(
          `reg query "${key}" /v ${valueName}`,
          { windowsHide: true, timeout: 5000 },
        )
        const match = new RegExp(`${valueName}\\s+REG_SZ\\s+(.+)`, 'i').exec(stdout)
        if (match?.[1]?.trim()) return match[1].trim()
      } catch { /* try next */ }
    }
  }
  return null
}

/** Replay + console.log roots: …/game (parent of citadel/, deadlock/, citadel_de/, …). */
export function replayDirsUnderGameRoot(gameRoot: string): string[] {
  const dirs: string[] = []
  for (const sub of REPLAY_SUBDIRS) {
    dirs.push(path.join(gameRoot, ...sub.split('/')))
  }
  try {
    for (const entry of fs.readdirSync(gameRoot)) {
      if (/^citadel_/i.test(entry)) {
        dirs.push(path.join(gameRoot, entry, 'replays'))
      }
    }
  } catch { /* ignore */ }
  return dirs
}

export function consoleLogCandidatesUnderGameRoot(gameRoot: string): string[] {
  const dirs = [
    path.join(gameRoot, 'citadel', 'console.log'),
    path.join(gameRoot, 'deadlock', 'console.log'),
    path.join(gameRoot, 'citadel', 'logs', 'console.log'),
    path.join(gameRoot, 'deadlock', 'logs', 'console.log'),
  ]
  try {
    for (const entry of fs.readdirSync(gameRoot)) {
      if (/^citadel_/i.test(entry)) {
        dirs.push(path.join(gameRoot, entry, 'console.log'))
        dirs.push(path.join(gameRoot, entry, 'logs', 'console.log'))
      }
    }
  } catch { /* ignore */ }
  return dirs
}

function localDeadlockGameRoots(): string[] {
  const local = process.env.LOCALAPPDATA
  if (!local) return []
  return [path.join(local, 'Deadlock', 'game')]
}

function steamDeadlockGameRootsSync(steamPath: string): string[] {
  const roots: string[] = []
  const libraries = [
    steamPath,
    ...parseLibraryFolders(path.join(steamPath, 'steamapps', 'libraryfolders.vdf')),
  ]

  for (const lib of libraries) {
    roots.push(path.join(lib, 'steamapps', 'common', 'Deadlock', 'game'))
    try {
      const manifest = path.join(lib, 'steamapps', `appmanifest_${DEADLOCK_STEAM_APP_ID}.acf`)
      if (!fs.existsSync(manifest)) continue
      const text = fs.readFileSync(manifest, 'utf-8')
      const dirMatch = /"installdir"\s+"([^"]+)"/i.exec(text)
      if (dirMatch) {
        roots.push(path.join(lib, 'steamapps', 'common', dirMatch[1], 'game'))
      }
    } catch { /* ignore */ }
  }
  return roots
}

function uniqueExistingDirs(candidates: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const dir of candidates) {
    const norm = path.normalize(dir).toLowerCase()
    if (seen.has(norm)) continue
    seen.add(norm)
    out.push(dir)
  }
  return out
}

/** Sync subset — LOCALAPPDATA only (used by hot poll loops). */
export function getDeadlockReplayDirsSync(customDir?: string): string[] {
  if (customDir?.trim()) return [customDir.trim()]
  const candidates: string[] = []
  for (const root of localDeadlockGameRoots()) {
    candidates.push(...replayDirsUnderGameRoot(root))
  }
  return uniqueExistingDirs(candidates)
}

/** All known replay directories (AppData + Steam install, including language-specific citadel_*). */
export async function resolveDeadlockReplayDirs(customDir?: string): Promise<string[]> {
  if (customDir?.trim()) return [customDir.trim()]

  const candidates: string[] = []
  for (const root of localDeadlockGameRoots()) {
    candidates.push(...replayDirsUnderGameRoot(root))
  }

  const steamPath = await getSteamPath()
  if (steamPath) {
    for (const root of steamDeadlockGameRootsSync(steamPath)) {
      candidates.push(...replayDirsUnderGameRoot(root))
    }
  }

  return uniqueExistingDirs(candidates)
}

/** console.log paths to tail for -condebug match detection. */
export async function resolveDeadlockConsoleLogCandidates(): Promise<string[]> {
  const candidates: string[] = []
  for (const root of localDeadlockGameRoots()) {
    candidates.push(...consoleLogCandidatesUnderGameRoot(root))
  }

  const steamPath = await getSteamPath()
  if (steamPath) {
    for (const root of steamDeadlockGameRootsSync(steamPath)) {
      candidates.push(...consoleLogCandidatesUnderGameRoot(root))
    }
  }

  return [...new Set(candidates)]
}
