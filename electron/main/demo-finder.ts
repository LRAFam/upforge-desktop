import fs from 'fs'
import path from 'path'

const IS_WIN = process.platform === 'win32'

export interface DemoFileResult {
  found: boolean
  demoPath: string | null
  demoDir: string | null
  error?: string
}

export interface DemoFileEntry {
  name: string
  path: string
  sizeBytes: number
  modifiedAt: number
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Find the newest .dem in a directory modified after matchStartTime (with buffer). */
export function findNewestDemoInDir(dir: string, matchStartTime: number): string | null {
  const notBefore = matchStartTime - 60_000
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
        // skip unreadable
      }
    }
    return newest?.path ?? null
  } catch {
    return null
  }
}

/** Poll a demo directory for a new .dem file (game writes async after match). */
export async function pollForLatestDemo(
  demoDir: string,
  matchStartTime: number,
  maxWaitMs = 15_000,
  pollIntervalMs = 2_000,
): Promise<DemoFileResult> {
  if (!IS_WIN) {
    return { found: false, demoPath: null, demoDir: null }
  }

  if (!fs.existsSync(demoDir)) {
    return { found: false, demoPath: null, demoDir, error: 'Demo directory not found' }
  }

  const deadline = Date.now() + maxWaitMs
  while (Date.now() < deadline) {
    const demo = findNewestDemoInDir(demoDir, matchStartTime)
    if (demo) {
      return { found: true, demoPath: demo, demoDir }
    }
    await sleep(pollIntervalMs)
  }

  return { found: false, demoPath: null, demoDir }
}

export function listRecentDemosInDir(
  demoDir: string,
  limit = 8,
): { files: DemoFileEntry[]; dir: string; exists: boolean } {
  if (!fs.existsSync(demoDir)) {
    return { files: [], dir: demoDir, exists: false }
  }

  const files: DemoFileEntry[] = []
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
        // skip
      }
    }
  } catch {
    return { files: [], dir: demoDir, exists: true }
  }

  files.sort((a, b) => b.modifiedAt - a.modifiedAt)
  return { files: files.slice(0, limit), dir: demoDir, exists: true }
}
