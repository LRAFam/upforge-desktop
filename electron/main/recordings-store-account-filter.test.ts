import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const runtime = vi.hoisted(() => ({ root: '' }))
vi.mock('electron', () => ({ app: { getPath: () => runtime.root } }))
vi.mock('./vod-compressor', () => ({
  recordingPathVariants: (value: string) => [value],
  sourcePathForCompressed: () => null,
  deleteLocalRecordingFiles: vi.fn(),
}))

import { RecordingsStore, type NewRecording } from './recordings-store'

const valorantLink = { name: 'ValorantSmurf', tag: 'EUW' }

beforeEach(() => { runtime.root = fs.mkdtempSync(path.join(os.tmpdir(), 'upforge-game-library-')) })
afterEach(() => { fs.rmSync(runtime.root, { recursive: true, force: true }) })

function recording(game = 'lol', riotName = 'LeagueMain'): NewRecording {
  const filePath = path.join(runtime.root, `${game}-${riotName}.mp4`)
  fs.writeFileSync(filePath, 'recording')
  return {
    path: filePath, game, riotName, riotTag: 'EUW',
    map: "Summoner's Rift", agent: 'Wukong', gameMode: 'RANKED_SOLO', timeline: null,
  }
}

describe('recording visibility with a linked Valorant account', () => {
  it('keeps League footage and its pending review available after restart with a different Valorant ID', () => {
    const saved = new RecordingsStore().forUser(11).add(recording())
    const restarted = new RecordingsStore().forUser(11)

    expect(restarted.getAll(valorantLink)).toEqual([saved])
    expect(restarted.getPending(valorantLink)).toEqual([saved])
    expect(fs.existsSync(saved.path)).toBe(true)
  })

  it('keeps a League clip-only session in the dashboard, without presenting it as a full recording', () => {
    const store = new RecordingsStore().forUser(11)
    const saved = store.add({ ...recording(), path: '', clipsOnly: true, clipCount: 5 })

    expect(store.getPending(valorantLink)).toEqual([saved])
    expect(store.getAll(valorantLink)).toEqual([])
  })

  it('keeps archived League footage visible with the same account rules', () => {
    const store = new RecordingsStore().forUser(11)
    const saved = store.add(recording())
    store.markArchived(saved.id, 'archive-1')

    expect(store.getCloudBackedLocal(valorantLink)).toEqual([saved])
    fs.unlinkSync(saved.path)
    expect(new RecordingsStore().forUser(11).getAll(valorantLink)).toEqual([saved])
  })

  it('still filters Valorant recordings by the linked Valorant identity', () => {
    const store = new RecordingsStore().forUser(11)
    const linked = store.add(recording('valorant', 'ValorantSmurf'))
    store.add(recording('valorant', 'AnotherValorantAccount'))

    expect(store.getAll(valorantLink)).toEqual([linked])
    expect(store.getPending(valorantLink)).toEqual([linked])
    expect(store.getAll()).toHaveLength(2)
  })

  it('never exposes a League recording to a different UpForge login', () => {
    const store = new RecordingsStore()
    store.forUser(11).add(recording())
    store.setUserScope(22)

    expect(store.getAll(valorantLink)).toEqual([])
    expect(store.getPending(valorantLink)).toEqual([])
    expect(store.forUser(null).getAll(valorantLink)).toEqual([])
  })
})
