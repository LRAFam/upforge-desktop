/**
 * Owner report (Nov 2026): "I played a CS2 match and it recorded as a Valorant match" and
 * "matches are stored in whichever game is selected in the top bar".
 *
 * The orphan importer ran while the match-end flow was still saving the file, imported it with
 * the selected tab's game (and no map/agent), then the flow added the real row for the same file.
 * On the next start the duplicate collapse kept the orphan when it had the stub Valorant timeline.
 * A row the match flow saved must always win over an orphan import of the same file.
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
import { catalogueWriter, resetTimelineSyncLoads } from './recordings-store-files'

const USER = 11
const root = (): string => path.join(runtime.root, 'users', String(USER))
const indexPath = (): string => path.join(root(), 'recordings.json')

function media(name: string): string {
  const p = path.join(runtime.root, name)
  fs.writeFileSync(p, 'video')
  return p
}

/** What scanForOrphanedRecordings stored: tab game, no map/agent, stub Valorant timeline. */
function orphanRow(file: string, game = 'valorant'): NewRecording {
  return {
    path: file, riotName: '', riotTag: '', game, map: null, agent: null, gameMode: 'UNKNOWN',
    timeline: game === 'valorant'
      ? { game: 'valorant', map: null, agent: null, playerKills: [], roundSummaries: [] } as unknown as NewRecording['timeline']
      : null,
    orphanedImport: true,
  }
}

/** What the match-end flow stored for a CS2 match without GSI/demo data. */
function cs2FlowRow(file: string): NewRecording {
  return { path: file, riotName: '', riotTag: '', game: 'cs2', map: 'de_mirage', agent: null, gameMode: 'COMPETITIVE', timeline: null }
}

function openStore(): RecordingsStore {
  const s = new RecordingsStore()
  s.setUserScope(USER)
  return s
}

beforeEach(() => {
  runtime.root = fs.mkdtempSync(path.join(os.tmpdir(), 'uf-rec-orphan-'))
  resetTimelineSyncLoads()
})
afterEach(async () => {
  await catalogueWriter(indexPath()).flush()
  vi.restoreAllMocks()
  fs.rmSync(runtime.root, { recursive: true, force: true })
})

describe('orphan import vs the match flow row for the same file', () => {
  it('the flow row replaces an orphan import of the same file in the running session', () => {
    const file = media('2026-11-08 20-00-00.mp4')
    const store = openStore()
    store.add(orphanRow(file), 1_000)
    store.add(cs2FlowRow(file), 2_000)
    const rows = store.getAll()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ game: 'cs2', map: 'de_mirage' })
  })

  it('keeps an orphan the user already uploaded (its cloud job must not be lost)', () => {
    const file = media('2026-11-08 21-00-00.mp4')
    const store = openStore()
    const orphan = store.add(orphanRow(file), 1_000)
    store.markAnalysed(orphan.id, 'job-1')
    store.add(cs2FlowRow(file), 2_000)
    expect(store.getAll().map(r => r.game).sort()).toEqual(['cs2', 'valorant'])
  })

  it('on start-up the flow-saved CS2 row wins over the Valorant-labelled orphan with a stub timeline', async () => {
    const file = media('2026-11-08 22-00-00.mp4')
    fs.mkdirSync(root(), { recursive: true })
    // Written by 3.4.x: both rows exist; the orphan has a timeline, the CS2 row does not.
    fs.writeFileSync(indexPath(), JSON.stringify([
      { ...cs2FlowRow(file), id: 'flow', recordedAt: 2_000, analysed: false },
      { ...orphanRow(file), id: 'orphan', recordedAt: 1_000, analysed: false },
    ]))
    const rows = openStore().getAll()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: 'flow', game: 'cs2' })
  })
})
