import fs from 'fs'
import { join } from 'path'
import log from 'electron-log'
import { MIN_RECORDING_FILE_BYTES } from './recording-limits'

export interface ResolvedRecordingFile {
  path: string
  sizeBytes: number
}

function statRecordingFile(filePath: string): ResolvedRecordingFile | null {
  try {
    const sizeBytes = fs.statSync(filePath).size
    if (sizeBytes < MIN_RECORDING_FILE_BYTES) return null
    return { path: filePath, sizeBytes }
  } catch {
    return null
  }
}

function listCandidateFiles(savePath: string, notBeforeMs: number): ResolvedRecordingFile[] {
  if (!fs.existsSync(savePath)) return []

  const candidates: Array<ResolvedRecordingFile & { mtimeMs: number }> = []
  for (const name of fs.readdirSync(savePath)) {
    const lower = name.toLowerCase()
    if (!lower.endsWith('.mp4') || lower.includes('_upforge')) continue

    const fullPath = join(savePath, name)
    try {
      const stat = fs.statSync(fullPath)
      if (!stat.isFile()) continue
      if (stat.mtimeMs < notBeforeMs) continue
      if (stat.size < MIN_RECORDING_FILE_BYTES) continue
      candidates.push({ path: fullPath, sizeBytes: stat.size, mtimeMs: stat.mtimeMs })
    } catch {
      continue
    }
  }

  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return candidates.map(({ path, sizeBytes }) => ({ path, sizeBytes }))
}

/**
 * Resolve the finished match recording. OBS sometimes reports a stale path or none at all
 * when Output Mode / directory settings differ from what UpForge applied.
 */
export function resolveReadyRecordingPath(
  preferredPath: string | null | undefined,
  savePath: string,
  notBeforeMs: number,
): ResolvedRecordingFile | null {
  if (preferredPath) {
    const direct = statRecordingFile(preferredPath)
    if (direct) return direct
  }

  const candidates = listCandidateFiles(savePath, notBeforeMs - 60_000)
  if (candidates.length === 0) return null

  const newest = candidates[0]
  if (preferredPath && newest.path !== preferredPath) {
    log.warn(
      `[RecordingPath] Using fallback file ${newest.path} (OBS reported ${preferredPath ?? 'none'})`,
    )
  }
  return newest
}

/** Local MP4s on disk that are not already tracked in recordings.json. */
export function listUnregisteredRecordingFiles(
  savePath: string,
  knownPaths: Set<string>,
  notBeforeMs: number,
): ResolvedRecordingFile[] {
  return listCandidateFiles(savePath, notBeforeMs).filter((file) => !knownPaths.has(file.path))
}
