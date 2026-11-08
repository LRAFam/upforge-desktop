import fs from 'node:fs'
import path from 'node:path'
import { redactSensitiveString } from './error-redaction'

export interface SupportActivityEntry { time: number; message: string; game?: string }
const MAX_ENTRIES = 500
const MAX_BYTES = 512 * 1024
const MAX_MESSAGE_CHARS = 800
export const SUPPORT_ACTIVITY_FLUSH_MS = 5_000
const FILE_NAME = 'support-activity.json'

function parseEntries(raw: string): SupportActivityEntry[] {
  const entries: unknown = JSON.parse(raw)
  if (!Array.isArray(entries)) return []
  return entries.filter((entry): entry is SupportActivityEntry => (
    entry && Number.isFinite(entry.time) && typeof entry.message === 'string'
  )).slice(-MAX_ENTRIES)
}

function sanitize(entry: SupportActivityEntry): SupportActivityEntry {
  return { ...entry, message: redactSensitiveString(entry.message).slice(0, MAX_MESSAGE_CHARS) }
}

/** Last MAX_ENTRIES entries whose JSON fits in MAX_BYTES (UTF-8 can be >1 byte per char). */
function boundedJson(entries: SupportActivityEntry[]): string {
  let bounded = entries.slice(-MAX_ENTRIES)
  let json = JSON.stringify(bounded)
  while (Buffer.byteLength(json) > MAX_BYTES && bounded.length) {
    // Drop ~10% per pass instead of re-stringifying once per removed entry.
    bounded = bounded.slice(Math.max(1, Math.floor(bounded.length / 10)))
    json = JSON.stringify(bounded)
  }
  return json
}

/** Each UpForge profile owns its support history, including across restarts. */
export function readSupportActivity(root: string): SupportActivityEntry[] {
  const file = path.join(root, FILE_NAME)
  try {
    if (fs.statSync(file).size > MAX_BYTES) return []
    return parseEntries(fs.readFileSync(file, 'utf8'))
  } catch {
    return []
  }
}

function writeSync(root: string, entries: SupportActivityEntry[], tmpSuffix = '.tmp'): void {
  const file = path.join(root, FILE_NAME)
  try {
    fs.mkdirSync(root, { recursive: true })
    fs.writeFileSync(`${file}${tmpSuffix}`, boundedJson(entries), 'utf8')
    fs.renameSync(`${file}${tmpSuffix}`, file)
  } catch {
    // Diagnostics must never prevent recording. The session log still exists.
  }
}

/** Synchronous one-off append (tests / tooling). The app uses createSupportActivityStore. */
export function appendSupportActivity(root: string, entry: SupportActivityEntry): void {
  writeSync(root, [...readSupportActivity(root), sanitize(entry)])
}

interface RootState {
  /** null until the on-disk history has been read (async, once per root). */
  entries: SupportActivityEntry[] | null
  /** Appended before the disk read finished. */
  pending: SupportActivityEntry[]
  loading: Promise<void> | null
  dirty: boolean
  timer: ReturnType<typeof setTimeout> | null
  writing: Promise<void> | null
}

export interface SupportActivityStore {
  /** In-memory append — never touches the disk synchronously. Flushed ≤ once per 5 s. */
  append(root: string, entry: SupportActivityEntry): void
  /** Disk history + unflushed entries for one profile. */
  read(root: string): Promise<SupportActivityEntry[]>
  /** Write every dirty profile now (async). */
  flush(): Promise<void>
  /** Quit path only: write every dirty profile synchronously so nothing is lost on exit. */
  flushSync(): void
}

/**
 * Support activity history kept in memory and persisted with fs.promises on a 5 s
 * throttle. logActivity runs on the main thread during matches, so it must not do
 * sync reads/parses/writes per call.
 */
export function createSupportActivityStore(opts: {
  flushDelayMs?: number
  fsp?: Pick<typeof fs.promises, 'readFile' | 'writeFile' | 'rename' | 'mkdir' | 'stat'>
} = {}): SupportActivityStore {
  const delay = opts.flushDelayMs ?? SUPPORT_ACTIVITY_FLUSH_MS
  const fsp = opts.fsp ?? fs.promises
  const roots = new Map<string, RootState>()
  /** Set by flushSync: an async write still in flight must not rename older data over it. */
  let syncFlushed = false

  const stateFor = (root: string): RootState => {
    let state = roots.get(root)
    if (!state) {
      state = { entries: null, pending: [], loading: null, dirty: false, timer: null, writing: null }
      roots.set(root, state)
    }
    return state
  }

  const load = (root: string, state: RootState): Promise<void> => {
    if (state.entries) return Promise.resolve()
    if (!state.loading) {
      const file = path.join(root, FILE_NAME)
      state.loading = (async () => {
        let disk: SupportActivityEntry[] = []
        try {
          if ((await fsp.stat(file)).size <= MAX_BYTES) disk = parseEntries(await fsp.readFile(file, 'utf8'))
        } catch { /* missing or corrupt — start fresh, as before */ }
        state.entries = [...disk, ...state.pending].slice(-MAX_ENTRIES)
        state.pending = []
        state.loading = null
      })()
    }
    return state.loading
  }

  const writeRoot = async (root: string, state: RootState): Promise<void> => {
    await load(root, state)
    if (!state.dirty || !state.entries) return
    state.dirty = false
    const file = path.join(root, FILE_NAME)
    try {
      await fsp.mkdir(root, { recursive: true })
      await fsp.writeFile(`${file}.tmp`, boundedJson(state.entries), 'utf8')
      if (syncFlushed) return
      await fsp.rename(`${file}.tmp`, file)
    } catch {
      // Diagnostics must never prevent recording. The session log still exists.
    }
  }

  const flushRoot = (root: string, state: RootState): Promise<void> => {
    if (state.timer) { clearTimeout(state.timer); state.timer = null }
    // Serialise writes per profile so tmp/rename pairs never interleave.
    const run = (state.writing ?? Promise.resolve()).then(() => writeRoot(root, state))
    state.writing = run.finally(() => { if (state.writing === run) state.writing = null })
    return run
  }

  return {
    append(root, entry) {
      const state = stateFor(root)
      const clean = sanitize(entry)
      if (state.entries) {
        state.entries.push(clean)
        if (state.entries.length > MAX_ENTRIES) state.entries.splice(0, state.entries.length - MAX_ENTRIES)
      } else {
        state.pending.push(clean)
        if (state.pending.length > MAX_ENTRIES) state.pending.splice(0, state.pending.length - MAX_ENTRIES)
        void load(root, state)
      }
      state.dirty = true
      // Throttle, not reset-on-append: steady logging still flushes every `delay` ms.
      if (!state.timer) {
        state.timer = setTimeout(() => {
          state.timer = null
          void flushRoot(root, state)
        }, delay)
        state.timer.unref?.()
      }
    },
    async read(root) {
      const state = stateFor(root)
      await load(root, state)
      return [...(state.entries ?? [])]
    },
    async flush() {
      await Promise.all([...roots].map(([root, state]) => flushRoot(root, state)))
    },
    flushSync() {
      syncFlushed = true
      for (const [root, state] of roots) {
        if (state.timer) { clearTimeout(state.timer); state.timer = null }
        if (!state.dirty && !state.writing) continue
        state.dirty = false
        const entries = state.entries ?? [...readSupportActivity(root), ...state.pending]
        // Own tmp name: an async write may still be filling `.tmp` in the threadpool.
        writeSync(root, entries, '.quit.tmp')
      }
    },
  }
}
