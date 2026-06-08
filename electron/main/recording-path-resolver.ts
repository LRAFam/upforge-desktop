import fs from 'fs'
import path from 'path'
import { join } from 'path'
import log from 'electron-log'
import { MIN_RECORDING_FILE_BYTES } from './recording-limits'
import {
  compressedPathFor,
  recordingPathVariants,
  sourcePathForCompressed,
} from './vod-compressor'

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

function isPathKnown(filePath: string, knownPaths: Set<string>): boolean {
  const normalized = path.normalize(filePath)
  if (knownPaths.has(normalized)) return true
  for (const variant of recordingPathVariants(filePath)) {
    if (knownPaths.has(path.normalize(variant))) return true
  }
  return false
}

/**
 * When OBS raw + UpForge-compressed siblings both exist, prefer the compressed file
 * for dashboard/import (smaller, upload-ready).
 */
export function preferredRecordingPath(filePath: string): string {
  const compressed = compressedPathFor(filePath)
  if (compressed === filePath) return filePath
  if (fs.existsSync(compressed)) {
    const stat = statRecordingFile(compressed)
    if (stat) return stat.path
  }
  return filePath
}

function shouldSkipRawWhenCompressedExists(filePath: string): boolean {
  if (sourcePathForCompressed(filePath)) return false
  const compressed = compressedPathFor(filePath)
  if (compressed === filePath) return false
  return statRecordingFile(compressed) != null
}

function listCandidateFiles(savePath: string, notBeforeMs: number): ResolvedRecordingFile[] {
  if (!fs.existsSync(savePath)) return []

  const candidates: Array<ResolvedRecordingFile & { mtimeMs: number }> = []
  for (const name of fs.readdirSync(savePath)) {
    const lower = name.toLowerCase()
    if (!lower.endsWith('.mp4')) continue

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
  return candidates.map(({ path: filePath, sizeBytes }) => ({ path: filePath, sizeBytes }))
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
    if (direct) return { ...direct, path: preferredRecordingPath(direct.path) }

    const preferredSibling = statRecordingFile(preferredRecordingPath(preferredPath))
    if (preferredSibling) return preferredSibling
  }

  const candidates = listCandidateFiles(savePath, notBeforeMs - 60_000)
  if (candidates.length === 0) return null

  const newest = candidates[0]!
  const resolvedPath = preferredRecordingPath(newest.path)
  const resolved = statRecordingFile(resolvedPath) ?? newest

  if (preferredPath && resolved.path !== preferredPath) {
    log.warn(
      `[RecordingPath] Using fallback file ${resolved.path} (OBS reported ${preferredPath ?? 'none'})`,
    )
  }
  return resolved
}

/** Local MP4s on disk that are not already tracked in recordings.json. */
export function listUnregisteredRecordingFiles(
  savePath: string,
  knownPaths: Set<string>,
  notBeforeMs: number,
): ResolvedRecordingFile[] {
  const seenStems = new Set<string>()

  return listCandidateFiles(savePath, notBeforeMs).filter((file) => {
    if (isPathKnown(file.path, knownPaths)) return false
    if (shouldSkipRawWhenCompressedExists(file.path)) return false

    const stemKey = path
      .join(path.dirname(file.path), path.basename(file.path, '.mp4').replace(/_upforge$/, ''))
      .toLowerCase()
    if (seenStems.has(stemKey)) return false
    seenStems.add(stemKey)

    return true
  }).map((file) => ({
    path: preferredRecordingPath(file.path),
    sizeBytes: statRecordingFile(preferredRecordingPath(file.path))?.sizeBytes ?? file.sizeBytes,
  }))
}
