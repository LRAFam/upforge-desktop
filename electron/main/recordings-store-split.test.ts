/**
 * recordings.json split: small index + one timeline file per recording, async debounced writes.
 * Owner's 3.2.5 catalogue was 73.7 MB (timelines inline); every save was a sync 1–3 s block.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const runtime = vi.hoisted(() => ({ root: '' }))
vi.mock('electron', () => ({ app: { getPath: () => runtime.root } }))
vi.mock('./vod-compressor', () => ({
  recordingPathVariants: (v: string) => [v],
  sourcePathForCompressed: () => null,
  deleteLocalRecordingFiles: vi.fn(),
}))

import { RecordingsStore, type NewRecording } from './recordings-store'
import {
  PRE_SPLIT_BACKUP,
  TIMELINES_DIR,
  catalogueWriter,
  resetTimelineSyncLoads,
  rowTimelineSummary,
  timelineSyncLoads,
} from './recordings-store-files'

const USER = 7
const root = (): string => path.join(runtime.root, 'users', String(USER))
const indexPath = (): string => path.join(root(), 'recordings.json')

/** ~1.5 MB timeline: Riot matchDetails + events dominate, like the owner's rows. */
function bigTimeline(i: number): NonNullable<NewRecording['timeline']> {
  return {
    matchId: `m-${i}`, map: 'Ascent', agent: 'Sage', gameMode: 'COMPETITIVE', playerName: 'P', playerTag: 'EU',
    finalStats: { kills: 20, deaths: 10, assists: 5, won: true },
    finalScore: { allyScore: 13, enemyScore: 9 },
    playerKills: Array.from({ length: 20 }, (_, k) => ({ videoOffsetMs: k * 1000, round: k })),
    roundSummaries: Array.from({ length: 22 }, (_, r) => ({ roundNumber: r })),
    killEvents: Array.from({ length: 300 }, (_, k) => ({ EventID: k, killerName: 'a'.repeat(20), victimName: 'b'.repeat(20), videoOffsetMs: k, assistants: [] })),
    events: Array.from({ length: 9000 }, (_, e) => ({ t: e, type: 'damage', from: 'z'.repeat(36), to: 'w'.repeat(36), pos: [e, e + 1, e + 2] })),
    matchDetails: { rounds: Array.from({ length: 24 }, (_, r) => ({ r, players: Array.from({ length: 10 }, (_, p) => ({ p, puuid: 'x'.repeat(36), damage: Array.from({ length: 10 }, (_, d) => ({ receiver: 'y'.repeat(36), damage: d })) })) })) },
  } as unknown as NonNullable<NewRecording['timeline']>
}

function media(name: string): string {
  const p = path.join(runtime.root, name)
  fs.writeFileSync(p, 'video')
  return p
}

function row(i: number, timeline: NewRecording['timeline'] = bigTimeline(i)): NewRecording {
  return { path: media(`m${i}.mp4`), riotName: 'P', riotTag: 'EU', game: 'valorant', map: 'Ascent', agent: 'Sage', gameMode: 'COMPETITIVE', timeline }
}

/** Old (≤3.2.5) catalogue: rows with the timeline inline, pretty-printed. */
function writeLegacyCatalogue(n: number): Array<Record<string, unknown>> {
  const rows = Array.from({ length: n }, (_, i) => ({ ...row(i), id: `id-${i}`, recordedAt: 1000 + i, analysed: false }))
  fs.mkdirSync(root(), { recursive: true })
  fs.writeFileSync(indexPath(), JSON.stringify(rows, null, 2))
  return rows
}

function openStore(): RecordingsStore {
  const s = new RecordingsStore()
  s.setUserScope(USER)
  return s
}

beforeEach(() => {
  runtime.root = fs.mkdtempSync(path.join(os.tmpdir(), 'uf-rec-split-'))
  resetTimelineSyncLoads()
})
afterEach(async () => {
  await catalogueWriter(indexPath()).flush()
  vi.restoreAllMocks()
  fs.rmSync(runtime.root, { recursive: true, force: true })
})

describe('recordings.json split — migration', () => {
  it('moves inline timelines to their own files, shrinks the index, keeps a backup, and is idempotent', async () => {
    const legacy = writeLegacyCatalogue(5)
    const before = fs.statSync(indexPath()).size
    const store = openStore()
    await store.flush()

    const after = fs.statSync(indexPath()).size
    expect(after).toBeLessThan(before / 20)
    expect(fs.readFileSync(indexPath(), 'utf-8')).not.toContain('matchDetails')
    expect(fs.statSync(path.join(root(), PRE_SPLIT_BACKUP)).size).toBe(before)
    for (const r of legacy) {
      const file = path.join(root(), TIMELINES_DIR, `${r.id}.json`)
      expect(JSON.parse(fs.readFileSync(file, 'utf-8'))).toEqual(r.timeline)
    }

    // Restart: reads the small index, timelines come back intact (lazily / in the background).
    const reopened = openStore()
    await reopened.timelinesReady()
    for (const r of legacy) expect(await reopened.getTimelineAsync(String(r.id))).toEqual(r.timeline)
    expect(timelineSyncLoads).toBe(0)
    // Second start: nothing left to migrate, files untouched.
    const mtime = fs.statSync(indexPath()).mtimeMs
    await reopened.flush()
    expect(fs.statSync(indexPath()).mtimeMs).toBe(mtime)
  })

  it('recovers from a crash mid-migration (index not rewritten yet): the next start migrates again', async () => {
    const legacy = writeLegacyCatalogue(3)
    const rename = fs.promises.rename
    const spy = vi.spyOn(fs.promises, 'rename').mockImplementation(async (from, to) => {
      if (String(to) === indexPath()) throw new Error('power cut')
      return rename(from, to)
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const crashed = openStore()
    await crashed.flush()
    // The old inline index is still the source of truth.
    expect(fs.readFileSync(indexPath(), 'utf-8')).toContain('matchDetails')
    spy.mockRestore()
    catalogueWriter(indexPath()).discard()

    const store = openStore()
    await store.flush()
    expect(fs.readFileSync(indexPath(), 'utf-8')).not.toContain('matchDetails')
    await store.timelinesReady()
    for (const r of legacy) expect(store.getById(String(r.id))?.timeline).toEqual(r.timeline)
  })

  it('falls back to the pre-split backup when a timeline file is missing', async () => {
    const legacy = writeLegacyCatalogue(2)
    await openStore().flush()
    fs.rmSync(path.join(root(), TIMELINES_DIR, 'id-1.json'))
    const store = openStore()
    expect(store.getById('id-1')?.timeline).toEqual(legacy[1].timeline)
  })
})

describe('recordings store — hot paths', () => {
  it('mutations never write synchronously; one debounced async write lands everything', async () => {
    const store = openStore()
    const writeFileSync = vi.spyOn(fs, 'writeFileSync')
    const renameSync = vi.spyOn(fs, 'renameSync')
    const a = store.add(row(1))
    store.add(row(2))
    store.setPipelineStatus(a.id, 'uploading')
    store.updateTimeline(a.id, { ...bigTimeline(9), matchId: 'm-updated' } as never)
    store.markAnalysed(a.id, 'job-1')
    expect(writeFileSync.mock.calls.filter(([p]) => String(p).includes(runtime.root) && !String(p).endsWith('.mp4'))).toHaveLength(0)
    expect(renameSync).not.toHaveBeenCalled()

    await store.flush()
    const index = JSON.parse(fs.readFileSync(indexPath(), 'utf-8')) as Array<Record<string, unknown>>
    expect(index.find((r) => r.id === a.id)).toMatchObject({ jobId: 'job-1', hasTimeline: true })
    expect(index[0]).not.toHaveProperty('timeline')
    const file = JSON.parse(fs.readFileSync(path.join(root(), TIMELINES_DIR, `${a.id}.json`), 'utf-8'))
    expect(file.matchId).toBe('m-updated')
  })

  it('listing, account filters and dedupe never load a timeline file', async () => {
    const store = openStore()
    for (let i = 0; i < 4; i++) store.add(row(i))
    await store.flush()
    resetTimelineSyncLoads()
    const cold = openStore() // index read; timelines still loading in the background
    cold.getPending({ name: 'P', tag: 'EU' })
    cold.getAll({ name: 'P', tag: 'EU' })
    cold.getAllLinked([{ name: 'P', tag: 'EU' }])
    cold.getKnownPaths()
    expect(timelineSyncLoads).toBe(0)
    await cold.timelinesReady()
    expect(cold.getAll()[0].timeline?.matchId).toMatch(/^m-/)
    expect(timelineSyncLoads).toBe(0)
  })

  it('removing a recording deletes its timeline file', async () => {
    const store = openStore()
    const a = store.add(row(1))
    await store.flush()
    const file = path.join(root(), TIMELINES_DIR, `${a.id}.json`)
    expect(fs.existsSync(file)).toBe(true)
    store.remove(a.id)
    await store.flush()
    expect(fs.existsSync(file)).toBe(false)
  })
})

describe('recordings list payload', () => {
  it('a list row carries a small summary, not the full timeline (≤ 2% of a 1.5 MB timeline)', () => {
    const store = openStore()
    const rec = store.add(row(1))
    const full = JSON.stringify(rec.timeline).length
    expect(full).toBeGreaterThan(1_400_000)
    const listRow = { ...rec, timeline: rowTimelineSummary(rec) }
    const size = JSON.stringify(listRow).length
    expect(size).toBeLessThan(full * 0.02)
    // What list views read is still there.
    expect(listRow.timeline).toMatchObject({ finalStats: { kills: 20 }, finalScore: { allyScore: 13 }, agent: 'Sage', playerName: 'P' })
    expect(listRow.timeline?.roundSummaries).toHaveLength(22)
    expect(listRow.timeline?.playerKills?.length).toBeGreaterThan(0)
    expect(listRow.timeline).not.toHaveProperty('matchDetails')
  })
})
