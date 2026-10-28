import fs from 'node:fs'
import path from 'node:path'
import { redactSensitiveString } from './error-redaction'

export interface SupportActivityEntry { time: number; message: string; game?: string }
const MAX_ENTRIES = 500
const MAX_BYTES = 512 * 1024

/** Each UpForge profile owns its support history, including across restarts. */
export function readSupportActivity(root: string): SupportActivityEntry[] {
  const file = path.join(root, 'support-activity.json')
  try {
    if (fs.statSync(file).size > MAX_BYTES) return []
    const entries: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!Array.isArray(entries)) return []
    return entries.filter((entry): entry is SupportActivityEntry => (
      entry && Number.isFinite(entry.time) && typeof entry.message === 'string'
    )).slice(-MAX_ENTRIES)
  } catch {
    return []
  }
}

export function appendSupportActivity(root: string, entry: SupportActivityEntry): void {
  const entries = readSupportActivity(root)
  entries.push({ ...entry, message: redactSensitiveString(entry.message).slice(0, 800) })
  const file = path.join(root, 'support-activity.json')
  // UTF-8 messages can occupy more than one byte per character.
  let bounded = entries.slice(-MAX_ENTRIES)
  while (Buffer.byteLength(JSON.stringify(bounded)) > MAX_BYTES) bounded = bounded.slice(1)
  try {
    fs.mkdirSync(root, { recursive: true })
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(bounded), 'utf8')
    fs.renameSync(`${file}.tmp`, file)
  } catch {
    // Diagnostics must never prevent recording. The session log still exists.
  }
}
