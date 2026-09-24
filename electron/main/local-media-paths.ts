import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { localMediaRoot, userDataRoot } from './user-data-paths'
import { recordingPathVariants } from './vod-compressor'

/** A file catalogued by another account (or pending a claim) is never an orphan. */
export function registeredLocalRecordingPaths(): Set<string> {
  const roots = [localMediaRoot(null)]
  const users = path.join(app.getPath('userData'), 'users')
  if (fs.existsSync(users)) {
    for (const entry of fs.readdirSync(users, { withFileTypes: true })) {
      if (entry.isDirectory() && /^\d+$/.test(entry.name)) roots.push(userDataRoot(Number(entry.name)))
    }
  }
  const paths = new Set<string>()
  for (const root of roots) {
    const catalog = path.join(root, 'recordings.json')
    if (!fs.existsSync(catalog)) continue
    // If ownership cannot be read, abort recovery rather than reassigning a file.
    const entries: Array<{ path?: string }> = JSON.parse(fs.readFileSync(catalog, 'utf8'))
    for (const entry of entries) {
      if (!entry.path) continue
      for (const variant of recordingPathVariants(entry.path)) paths.add(path.normalize(variant))
    }
  }
  return paths
}
