import { app } from 'electron'
import fs from 'fs'
import path from 'path'

/**
 * Durable list of recording files UpForge itself asked OBS to write. The OBS record folder is
 * shared with the user's own OBS recordings, so an uncatalogued file in it is not ours by default:
 * automatic cleanup may only ever delete a file listed here (or its `_upforge.mp4` export).
 */
const MAX_ENTRIES = 2000

export function ownedRecordingLedgerPath(): string {
  return path.join(app.getPath('userData'), 'owned-recordings.json')
}

/** One key for a recording and its `_upforge.mp4` export (same folder, same stem, any container). */
function recordingKey(filePath: string): string {
  const normalized = path.normalize(filePath)
  const stem = path.basename(normalized).replace(/\.(mp4|mkv|webm|mov|m4v|flv)$/i, '').replace(/_upforge$/, '')
  const key = path.join(path.dirname(normalized), stem)
  return process.platform === 'win32' ? key.toLowerCase() : key
}

function readLedger(ledgerPath: string): string[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(ledgerPath, 'utf8')) as unknown
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string' && p.length > 0) : []
  } catch {
    return []
  }
}

/** Remember that UpForge's own match capture wrote `filePath`. Best effort, never throws. */
export function markOwnedRecordingFile(filePath: string | null | undefined, ledgerPath = ownedRecordingLedgerPath()): void {
  if (!filePath) return
  try {
    const entries = readLedger(ledgerPath)
    const key = recordingKey(filePath)
    if (entries.some(p => recordingKey(p) === key)) return
    entries.push(path.normalize(filePath))
    // Drop the oldest entries whose files are gone before capping, so live files stay listed.
    let pruned = entries
    if (pruned.length > MAX_ENTRIES) {
      pruned = pruned.filter(p => fs.existsSync(p))
      if (pruned.length > MAX_ENTRIES) pruned = pruned.slice(pruned.length - MAX_ENTRIES)
    }
    fs.mkdirSync(path.dirname(ledgerPath), { recursive: true })
    fs.writeFileSync(ledgerPath, JSON.stringify(pruned))
  } catch { /* unlisted files are simply kept */ }
}

/** Keys of every owned recording (covers its raw and compressed variants). */
export function ownedRecordingFiles(ledgerPath = ownedRecordingLedgerPath()): Set<string> {
  return new Set(readLedger(ledgerPath).map(recordingKey))
}

export function isOwnedRecordingFile(filePath: string, owned: Set<string> = ownedRecordingFiles()): boolean {
  return owned.has(recordingKey(filePath))
}
