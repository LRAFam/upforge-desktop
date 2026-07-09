import fs from 'fs'
import path from 'path'
import { getCandidateCS2CsgoDirs } from './cs2-demo-finder'

const REPLAYS_DIR = 'replays'

/** Normalize settings/custom paths so `…/replays` maps back to the csgo root. */
export function normalizeCs2CsgoRoot(dir: string): string {
  const trimmed = dir.trim()
  if (path.win32.basename(trimmed).toLowerCase() === REPLAYS_DIR) {
    return path.win32.dirname(trimmed)
  }
  return trimmed
}

async function resolveCsgoRoots(customDir?: string): Promise<string[]> {
  if (customDir?.trim()) {
    return [normalizeCs2CsgoRoot(customDir.trim())]
  }
  return getCandidateCS2CsgoDirs()
}

/** CS2 roots + standard `replays/` subfolder (where Watch downloads land). */
export async function getCs2DemoSearchDirs(customDir?: string): Promise<string[]> {
  const roots = await resolveCsgoRoots(customDir)

  const dirs: string[] = []
  for (const root of roots) {
    dirs.push(root)
    dirs.push(path.win32.join(root, REPLAYS_DIR))
  }
  return [...new Set(dirs)]
}

/** `game/csgo` root — stored in settings and used for Valve CDN downloads. */
export async function getCs2CsgoRoot(customDir?: string): Promise<string | null> {
  const roots = await resolveCsgoRoots(customDir)
  return roots.find((root) => fs.existsSync(root)) ?? roots[0] ?? null
}

/**
 * Folder to show in UI / open in Explorer.
 * Watch downloads go in `replays/`; auto-record may write to the csgo root.
 */
export async function getCs2PreferredOpenFolder(customDir?: string): Promise<string | null> {
  const searchDirs = await getCs2DemoSearchDirs(customDir)
  const replaysDirs = searchDirs.filter(
    (dir) => path.win32.basename(dir).toLowerCase() === REPLAYS_DIR,
  )
  for (const dir of replaysDirs) {
    if (fs.existsSync(dir)) return dir
  }
  return searchDirs.find((dir) => fs.existsSync(dir)) ?? null
}

/** Preferred folder for UpForge-initiated Valve demo downloads. */
export async function getCs2ValveDemoDownloadDir(customDir?: string): Promise<string | null> {
  const roots = customDir?.trim()
    ? [customDir.trim()]
    : await getCandidateCS2CsgoDirs()
  const root = roots[0]
  if (!root) return null
  return path.win32.join(root, REPLAYS_DIR)
}
