import fs from 'fs'
import path from 'path'

/** One OBS recording UpForge owned — persisted so orphan recovery labels files by their real game. */
export interface RecordingSessionEntry {
  game: string
  startedAt: number
  endedAt: number | null
  outputPath: string | null
}

const MAX_ENTRIES = 20
/** OBS writes the file shortly after StopRecord; allow a little slack around the session edges. */
const START_SLACK_MS = 60_000
const END_SLACK_MS = 10 * 60_000

function recordingStem(filePath: string): string {
  return filePath.replace(/\\/g, '/').toLowerCase().replace(/(_upforge)?\.[a-z0-9]+$/, '')
}

/**
 * Game for a local recording that never reached recordings.json. Prefers the session whose
 * stopped output is this file, then the newest session that was recording when it was written.
 */
export function resolveOrphanRecordingGame(
  file: { path: string; modifiedAtMs: number | null },
  sessions: readonly RecordingSessionEntry[],
  fallbackGame: string,
): string {
  const stem = recordingStem(file.path)
  const byPath = sessions.find((s) => s.outputPath && recordingStem(s.outputPath) === stem)
  if (byPath) return byPath.game
  const modified = file.modifiedAtMs
  if (modified == null || !Number.isFinite(modified)) return fallbackGame
  const covering = [...sessions]
    .sort((a, b) => b.startedAt - a.startedAt)
    .find((s) => s.startedAt <= modified + START_SLACK_MS
      && (s.endedAt == null || modified <= s.endedAt + END_SLACK_MS))
  return covering?.game ?? fallbackGame
}

/** Small JSON-backed log of owned recording sessions (survives a crash or a stuck stop). */
export class RecordingSessionLog {
  private _entries: RecordingSessionEntry[]

  constructor(private readonly _filePath: string) {
    this._entries = this._read()
  }

  private _read(): RecordingSessionEntry[] {
    try {
      const parsed = JSON.parse(fs.readFileSync(this._filePath, 'utf8')) as unknown
      if (!Array.isArray(parsed)) return []
      return parsed.filter((e): e is RecordingSessionEntry =>
        !!e && typeof e === 'object' && typeof (e as RecordingSessionEntry).game === 'string'
        && typeof (e as RecordingSessionEntry).startedAt === 'number')
    } catch {
      return []
    }
  }

  private _write(): void {
    try {
      fs.mkdirSync(path.dirname(this._filePath), { recursive: true })
      fs.writeFileSync(this._filePath, JSON.stringify(this._entries))
    } catch { /* best effort — labels fall back to the primary game */ }
  }

  begin(game: string, startedAt: number): void {
    const open = this._entries[this._entries.length - 1]
    if (open && open.endedAt == null && open.game === game && open.startedAt === startedAt) return
    if (open && open.endedAt == null) open.endedAt = startedAt
    this._entries.push({ game, startedAt, endedAt: null, outputPath: null })
    if (this._entries.length > MAX_ENTRIES) this._entries.splice(0, this._entries.length - MAX_ENTRIES)
    this._write()
  }

  end(outputPath: string | null, endedAt = Date.now()): void {
    const open = this._entries[this._entries.length - 1]
    if (!open || open.endedAt != null) return
    open.endedAt = endedAt
    open.outputPath = outputPath
    this._write()
  }

  /** Game of the session still open (recording not confirmed stopped), else null. */
  activeGame(): string | null {
    const open = this._entries[this._entries.length - 1]
    return open && open.endedAt == null ? open.game : null
  }

  list(): RecordingSessionEntry[] {
    return this._entries.map((e) => ({ ...e }))
  }
}
