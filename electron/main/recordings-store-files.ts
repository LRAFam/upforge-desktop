/**
 * On-disk layout for the recordings catalogue.
 *
 * Before 3.2.6 every recording's full `timeline` (MatchData incl. Riot matchDetails) sat inline in
 * recordings.json (76 MB for one owner, 50 rows). Each save ran a sync pretty JSON.stringify of all of
 * it on the main thread (1–3 s freezes, also mid-match), and `recordings:get` cloned it to the renderer.
 *
 * Now:
 *  - recordings.json is a small index: the rows without `timeline`, plus `hasTimeline` and a
 *    `timelineSummary` (the few fields list views read — see slimTimelineForList).
 *  - each timeline lives in timelines/<recordingId>.json.
 *  - all writes are async, debounced, one writer per catalogue, temp file + rename.
 *  - timelines load in the background after start-up; a row read before that loads its own file
 *    once (sync fallback, counted in `timelineSyncLoads` so tests can prove hot paths never do it).
 *  - legacy inline catalogues migrate once: timeline files are written and verified first, a backup
 *    recordings.json.bak-pre-split is kept, and only then is the index rewritten. A crash in between
 *    leaves the old inline index, so the next start simply migrates again (idempotent).
 */
import fs from 'fs'
import path from 'path'
import type { MatchData } from './riot-local-api'

export const TIMELINES_DIR = 'timelines'
export const PRE_SPLIT_BACKUP = 'recordings.json.bak-pre-split'
const WRITE_DEBOUNCE_MS = 250

/** Arrays list views read in full (counts / small lookups). Every other array keeps one item. */
const LIST_FULL_ARRAYS = new Set(['teamSnapshot', 'roundSummaries', 'roundScores'])
/** Heavy blocks no list view reads. */
const LIST_DROP_KEYS = new Set(['matchDetails', 'events', 'spatialSummary', 'cs2Live'])

/**
 * Small projection of a timeline for list rows and the index. Keeps scalars and small objects
 * (finalStats, finalScore, agent, puuid, playerName…), keeps the arrays listed above, and trims every
 * other array to its first item so "has kills / deaths / demo" checks still work. Full data:
 * `recordings:get-timeline`.
 */
export function slimTimelineForList(t: MatchData | null | undefined): MatchData | null {
  if (!t || typeof t !== 'object') return null
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(t)) {
    if (LIST_DROP_KEYS.has(key)) continue
    if (Array.isArray(value)) out[key] = LIST_FULL_ARRAYS.has(key) ? value : value.slice(0, 1)
    else out[key] = value
  }
  return out as unknown as MatchData
}

interface TimelineSlot {
  value: MatchData | null
  loaded: boolean
  summary: MatchData | null
  /** File to lazy-load from while not loaded. */
  file: string | null
  onChange: () => void
}

const slots = new WeakMap<object, TimelineSlot>()

/** How many rows had to read their timeline synchronously (should stay 0 after start-up). */
export let timelineSyncLoads = 0
export function resetTimelineSyncLoads(): void { timelineSyncLoads = 0 }

function readTimelineFileSync(file: string): MatchData | null {
  timelineSyncLoads++
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as MatchData
  } catch {
    // Missing / corrupt file: fall back to the pre-split backup if it is still around.
    try {
      const bak = path.join(path.dirname(path.dirname(file)), PRE_SPLIT_BACKUP)
      const id = path.basename(file, '.json')
      const rows = JSON.parse(fs.readFileSync(bak, 'utf-8')) as Array<{ id?: string; timeline?: MatchData | null }>
      return rows.find((r) => r.id === id)?.timeline ?? null
    } catch {
      return null
    }
  }
}

/** Turn `rec.timeline` into an accessor backed by a slot (in memory once loaded, else its file). */
export function installTimeline(
  rec: object,
  init: { value?: MatchData | null; file?: string | null; summary?: MatchData | null },
  onChange: () => void,
): void {
  const existing = slots.get(rec)
  const loaded = init.value !== undefined
  const slot: TimelineSlot = existing
    ? { ...existing, onChange }
    : {
        value: loaded ? (init.value ?? null) : null,
        loaded,
        summary: loaded ? slimTimelineForList(init.value ?? null) : (init.summary ?? null),
        file: init.file ?? null,
        onChange,
      }
  if (!existing && !loaded && !slot.file) slot.loaded = true
  slots.set(rec, slot)
  Object.defineProperty(rec, 'timeline', {
    enumerable: true,
    configurable: true,
    get(): MatchData | null {
      if (!slot.loaded) {
        slot.value = slot.file ? readTimelineFileSync(slot.file) : null
        slot.loaded = true
      }
      return slot.value
    },
    set(next: MatchData | null | undefined) {
      slot.value = next ?? null
      slot.loaded = true
      slot.summary = slimTimelineForList(slot.value)
      slot.onChange()
    },
  })
}

/** Has a timeline (without loading it). */
export function rowHasTimeline(rec: object): boolean {
  const slot = slots.get(rec)
  if (!slot) return (rec as { timeline?: unknown }).timeline != null
  return slot.loaded ? slot.value != null : slot.summary != null || slot.file != null
}

/** Summary for list rows, never loading the full timeline. Works for plain rows too (fixtures). */
export function rowTimelineSummary(rec: object): MatchData | null {
  const slot = slots.get(rec)
  if (!slot) return slimTimelineForList((rec as { timeline?: MatchData | null }).timeline ?? null)
  return slot.summary
}

/** The timeline only if it is already in memory (null otherwise). */
function loadedTimeline(rec: object): { loaded: boolean; value: MatchData | null } {
  const slot = slots.get(rec)
  if (!slot) return { loaded: true, value: (rec as { timeline?: MatchData | null }).timeline ?? null }
  return { loaded: slot.loaded, value: slot.value }
}

/** Make sure a row's timeline is in memory, reading its file asynchronously if needed. */
async function ensureLoadedAsync(rec: object): Promise<void> {
  const slot = slots.get(rec)
  if (!slot || slot.loaded || !slot.file) return
  try {
    const parsed = JSON.parse(await fs.promises.readFile(slot.file, 'utf-8')) as MatchData
    if (!slot.loaded) { slot.value = parsed; slot.loaded = true }
  } catch { /* leave unloaded */ }
}

/** Load every not-yet-loaded timeline asynchronously, one file per tick. */
export async function loadTimelinesInBackground(rows: object[]): Promise<void> {
  for (const rec of rows) {
    const slot = slots.get(rec)
    if (!slot || slot.loaded || !slot.file) continue
    let parsed: MatchData | null = null
    try {
      parsed = JSON.parse(await fs.promises.readFile(slot.file, 'utf-8')) as MatchData
    } catch {
      continue // getter falls back to the backup if someone needs it
    }
    if (!slot.loaded) {
      slot.value = parsed
      slot.loaded = true
      if (!slot.summary) slot.summary = slimTimelineForList(parsed)
    }
    await new Promise<void>((resolve) => setImmediate(resolve))
  }
}

/** Index row on disk: every field except the timeline. */
export function indexRow(rec: object): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(rec)) {
    if (key === 'timeline') continue
    out[key] = (rec as Record<string, unknown>)[key]
  }
  out.hasTimeline = rowHasTimeline(rec)
  out.timelineSummary = rowTimelineSummary(rec)
  return out
}

export function timelineFile(indexPath: string, id: string): string {
  return path.join(path.dirname(indexPath), TIMELINES_DIR, `${id}.json`)
}

export interface LoadedCatalogue<T> {
  rows: T[]
  /** True when the file still had inline timelines (old format) — needs one migration write. */
  legacyInline: boolean
}

/**
 * Parse an index (new) or a legacy inline catalogue. Installs the timeline accessor on every row.
 * `onChange(id)` fires when a row's timeline is replaced.
 */
export function parseCatalogue<T extends { id: string }>(
  indexPath: string,
  raw: string,
  onChange: (id: string) => void,
): LoadedCatalogue<T> {
  const parsed = JSON.parse(raw) as Array<Record<string, unknown>>
  let legacyInline = false
  const rows = parsed.map((row) => {
    const id = String(row.id)
    if ('timeline' in row) {
      legacyInline = true
      const value = (row.timeline ?? null) as MatchData | null
      delete row.timeline
      delete row.hasTimeline
      delete row.timelineSummary
      installTimeline(row, { value }, () => onChange(id))
    } else {
      const has = row.hasTimeline === true
      const summary = (row.timelineSummary ?? null) as MatchData | null
      delete row.hasTimeline
      delete row.timelineSummary
      installTimeline(
        row,
        has ? { file: timelineFile(indexPath, id), summary } : { value: null },
        () => onChange(id),
      )
    }
    return row as unknown as T
  })
  return { rows, legacyInline }
}

let tmpSeq = 0
const tmpName = (file: string): string => `${file}.${process.pid}.${++tmpSeq}.tmp`

async function writeAtomic(file: string, contents: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(file), { recursive: true })
  const tmp = tmpName(file)
  await fs.promises.writeFile(tmp, contents, 'utf-8')
  await fs.promises.rename(tmp, file)
}

function writeAtomicSync(file: string, contents: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = tmpName(file)
  fs.writeFileSync(tmp, contents, 'utf-8')
  fs.renameSync(tmp, file)
}

/**
 * Single writer per catalogue file (shared by every RecordingsStore instance in the process).
 * `schedule()` debounces; writes are async; `flushSync()` exists for app quit only.
 */
export class CatalogueWriter {
  private timer: ReturnType<typeof setTimeout> | null = null
  private chain: Promise<void> = Promise.resolve()
  private rowsGetter: (() => object[]) | null = null
  private dirtyTimelines = new Set<string>()
  private needsBackup = false
  private scheduled = false

  constructor(readonly indexPath: string) {}

  get pending(): boolean {
    return this.scheduled
  }

  markTimelineDirty(id: string): void {
    this.dirtyTimelines.add(id)
  }

  markLegacyMigration(rows: object[]): void {
    this.needsBackup = true
    for (const rec of rows) this.dirtyTimelines.add(String((rec as { id: string }).id))
  }

  schedule(rows: () => object[]): void {
    this.rowsGetter = rows
    this.scheduled = true
    if (this.timer) return
    this.timer = setTimeout(() => { this.timer = null; void this.flush() }, WRITE_DEBOUNCE_MS)
    this.timer.unref?.()
  }

  /** Resolves when everything scheduled so far is on disk. */
  flush(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null }
    if (!this.scheduled) return this.chain
    this.scheduled = false
    this.chain = this.chain.then(() => this.writeNow()).catch((err) => {
      const code = (err as NodeJS.ErrnoException)?.code
      console.error(code === 'ENOSPC'
        ? '[RecordingsStore] Disk full — could not persist recordings list'
        : '[RecordingsStore] Failed to persist recordings:', err)
    })
    return this.chain
  }

  private takeWork(): { rows: object[]; dirty: string[]; backup: boolean } | null {
    const rows = this.rowsGetter?.()
    if (!rows) return null
    const dirty = [...this.dirtyTimelines]
    this.dirtyTimelines.clear()
    const backup = this.needsBackup
    this.needsBackup = false
    return { rows, dirty, backup }
  }

  private async writeNow(): Promise<void> {
    const work = this.takeWork()
    if (!work) return
    const { rows, dirty, backup } = work
    const byId = new Map(rows.map((r) => [String((r as { id: string }).id), r]))
    try {
      if (backup) {
        const bak = path.join(path.dirname(this.indexPath), PRE_SPLIT_BACKUP)
        try { await fs.promises.access(bak) } catch {
          try { await fs.promises.copyFile(this.indexPath, bak) } catch { /* no old file */ }
        }
      }
      // Timelines first, verified, then the index: a crash in between keeps the old index valid.
      for (const id of dirty) {
        const rec = byId.get(id)
        if (!rec) continue
        await ensureLoadedAsync(rec)
        const { loaded, value } = loadedTimeline(rec)
        if (!loaded) continue
        const file = timelineFile(this.indexPath, id)
        if (value == null) {
          await fs.promises.rm(file, { force: true })
          continue
        }
        const json = JSON.stringify(value)
        await writeAtomic(file, json)
        const { size } = await fs.promises.stat(file)
        if (size !== Buffer.byteLength(json)) throw new Error(`timeline ${id} verify failed`)
      }
      await writeAtomic(this.indexPath, JSON.stringify(rows.map(indexRow)))
    } catch (err) {
      // Retry the timelines on the next write.
      for (const id of dirty) this.dirtyTimelines.add(id)
      if (backup) this.needsBackup = true
      throw err
    }
    await this.removeOrphanTimelines(new Set(byId.keys()))
  }

  private async removeOrphanTimelines(keep: Set<string>): Promise<void> {
    const dir = path.join(path.dirname(this.indexPath), TIMELINES_DIR)
    let names: string[] = []
    try { names = await fs.promises.readdir(dir) } catch { return }
    for (const name of names) {
      if (!name.endsWith('.json')) continue
      if (keep.has(name.slice(0, -'.json'.length))) continue
      await fs.promises.rm(path.join(dir, name), { force: true }).catch(() => {})
    }
  }

  /** Drop scheduled work without writing (tests that mock fs). */
  discard(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null }
    this.scheduled = false
    this.dirtyTimelines.clear()
    this.needsBackup = false
  }

  /** Rows this writer was last given (in-memory truth, may be newer than the file). */
  currentRows(): object[] {
    return this.rowsGetter?.() ?? []
  }

  /**
   * App quit, login claim, or a second store instance in this process: write now, synchronously.
   * `throwOnError` lets callers that must not continue without a durable write (claimGuest) stop.
   */
  flushSync(opts: { throwOnError?: boolean } = {}): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null }
    if (!this.scheduled) return
    this.scheduled = false
    const work = this.takeWork()
    if (!work) return
    const { rows, dirty, backup } = work
    const byId = new Map(rows.map((r) => [String((r as { id: string }).id), r]))
    try {
      if (backup) {
        const bak = path.join(path.dirname(this.indexPath), PRE_SPLIT_BACKUP)
        if (!fs.existsSync(bak) && fs.existsSync(this.indexPath)) fs.copyFileSync(this.indexPath, bak)
      }
      for (const id of dirty) {
        const rec = byId.get(id)
        if (!rec) continue
        const { loaded, value } = loadedTimeline(rec)
        if (!loaded) continue
        const file = timelineFile(this.indexPath, id)
        if (value == null) fs.rmSync(file, { force: true })
        else writeAtomicSync(file, JSON.stringify(value))
      }
      writeAtomicSync(this.indexPath, JSON.stringify(rows.map(indexRow)))
    } catch (err) {
      for (const id of dirty) this.dirtyTimelines.add(id)
      if (backup) this.needsBackup = true
      this.scheduled = true
      console.error('[RecordingsStore] Failed to persist recordings:', err)
      if (opts.throwOnError) throw err
    }
  }
}

const writers = new Map<string, CatalogueWriter>()

export function catalogueWriter(indexPath: string): CatalogueWriter {
  let w = writers.get(indexPath)
  if (!w) { w = new CatalogueWriter(indexPath); writers.set(indexPath, w) }
  return w
}

/** Recording paths held in memory by every catalogue in this process (incl. unsaved rows). */
export function inMemoryCataloguePaths(underDir: string): string[] {
  const out: string[] = []
  const base = path.resolve(underDir) + path.sep
  for (const w of writers.values()) {
    if (!path.resolve(w.indexPath).startsWith(base)) continue
    for (const rec of w.currentRows()) {
      const p = (rec as { path?: string }).path
      if (p) out.push(p)
    }
  }
  return out
}

/** Flush every catalogue (app quit). */
export function flushAllCataloguesSync(): void {
  for (const w of writers.values()) w.flushSync()
}

export async function flushAllCatalogues(): Promise<void> {
  await Promise.all([...writers.values()].map((w) => w.flush()))
}
