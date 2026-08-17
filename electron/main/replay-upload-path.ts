import fs from 'fs'
import path from 'path'

export type ReplayUploadPathResult =
  | { ok: true; path: string }
  | { ok: false; error: string }

/** Resolve one regular .dem file contained by an approved replay root. */
export function validateReplayUploadPath(candidate: string, replayRoots: string[]): ReplayUploadPathResult {
  if (typeof candidate !== 'string' || path.extname(candidate).toLowerCase() !== '.dem') {
    return { ok: false, error: 'Select a Deadlock .dem replay file' }
  }

  let canonicalFile: string
  try {
    canonicalFile = fs.realpathSync(candidate)
    if (!fs.statSync(canonicalFile).isFile()) {
      return { ok: false, error: 'Replay path is not a regular file' }
    }
  } catch {
    return { ok: false, error: 'Demo file not found' }
  }

  const insideApprovedRoot = replayRoots.some((root) => {
    try {
      const canonicalRoot = fs.realpathSync(root)
      const relative = path.relative(canonicalRoot, canonicalFile)
      return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
    } catch {
      return false
    }
  })

  return insideApprovedRoot
    ? { ok: true, path: canonicalFile }
    : { ok: false, error: 'Replay file is outside the approved Deadlock replay folders' }
}
