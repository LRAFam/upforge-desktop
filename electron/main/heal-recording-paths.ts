/**
 * When legacy migration moves VODs into users/{id}/recordings/, recordings.json
 * can still point at the old global path. Missing paths then get pruned from the
 * catalog and vanish from the dashboard even though the files still exist.
 */
import fs from 'fs'
import path from 'path'

export function candidateRecordingDirs(
  currentPath: string,
  searchDirs: Array<string | null | undefined>,
): string[] {
  const dirs = new Set<string>()
  const currentDir = path.dirname(currentPath)
  if (currentDir && currentDir !== '.') dirs.add(path.normalize(currentDir))
  for (const dir of searchDirs) {
    const trimmed = String(dir ?? '').trim()
    if (trimmed) dirs.add(path.normalize(trimmed))
  }
  return [...dirs]
}

/** Resolve a missing recording path by basename in known save folders. */
export function healRecordingPath(
  storedPath: string | null | undefined,
  searchDirs: Array<string | null | undefined>,
): string | null {
  const raw = String(storedPath ?? '').trim()
  if (!raw) return null
  if (fs.existsSync(raw)) return raw

  const base = path.basename(raw)
  if (!base) return null

  for (const dir of candidateRecordingDirs(raw, searchDirs)) {
    const candidate = path.join(dir, base)
    if (candidate !== raw && fs.existsSync(candidate)) return candidate
  }
  return null
}
