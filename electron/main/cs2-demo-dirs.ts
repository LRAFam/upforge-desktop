import path from 'path'
import { getCandidateCS2CsgoDirs } from './cs2-demo-finder'

/** CS2 roots + standard `replays/` subfolder (where Valve client saves GOTV downloads). */
export async function getCs2DemoSearchDirs(customDir?: string): Promise<string[]> {
  const roots = customDir?.trim()
    ? [customDir.trim()]
    : await getCandidateCS2CsgoDirs()

  const dirs: string[] = []
  for (const root of roots) {
    dirs.push(root)
    dirs.push(path.join(root, 'replays'))
  }
  return [...new Set(dirs)]
}

/** Preferred folder for UpForge-initiated Valve demo downloads. */
export async function getCs2ValveDemoDownloadDir(customDir?: string): Promise<string | null> {
  const roots = customDir?.trim()
    ? [customDir.trim()]
    : await getCandidateCS2CsgoDirs()
  const root = roots[0]
  if (!root) return null
  return path.join(root, 'replays')
}
