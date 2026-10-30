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

import { RecordingsStore, riotAccountRole, type NewRecording } from './recordings-store'

const linked = [
  { name: 'LRAFam', tag: '1337', isMain: true },
  { name: 'lrasmurf', tag: '0420', isMain: false },
]
const row = (riotName?: string, riotTag?: string, game: 'valorant' | 'cs2' = 'valorant') =>
  ({ game, riotName, riotTag, timeline: null }) as Parameters<typeof riotAccountRole>[0]

beforeEach(() => { runtime.root = fs.mkdtempSync(path.join(os.tmpdir(), 'upforge-account-role-')) })
afterEach(() => { fs.rmSync(runtime.root, { recursive: true, force: true }) })

function recording(riotName: string, riotTag: string, game = 'valorant'): NewRecording {
  const filePath = path.join(runtime.root, `${game}-${riotName}.mp4`)
  fs.writeFileSync(filePath, 'recording')
  return { path: filePath, game, riotName, riotTag, map: 'Bind', agent: 'Jett', gameMode: 'competitive', timeline: null }
}

describe('riotAccountRole', () => {
  it('marks the active linked account as main and other linked accounts as alt (case-insensitive)', () => {
    expect(riotAccountRole(row('lrafam', '1337'), linked)).toBe('main')
    expect(riotAccountRole(row('LRASMURF', '0420'), linked)).toBe('alt')
  })

  it('never tags a Riot ID the user has not linked, e.g. someone else on a shared PC', () => {
    expect(riotAccountRole(row('kiwi', '7781'), linked)).toBeNull()
  })

  it('leaves other games and rows without a Riot ID untagged', () => {
    expect(riotAccountRole(row('LRAFam', '1337', 'cs2'), linked)).toBeNull()
    expect(riotAccountRole(row(undefined, undefined), linked)).toBeNull()
  })
})

describe('RecordingsStore.getAllLinked', () => {
  it('lists main and alt Valorant matches but hides unlinked Riot IDs', () => {
    const store = new RecordingsStore()
    store.add(recording('LRAFam', '1337'))
    store.add(recording('lrasmurf', '0420'))
    store.add(recording('kiwi', '7781'))
    const names = store.getAllLinked(linked).map(r => r.riotName).sort()
    expect(names).toEqual(['LRAFam', 'lrasmurf'])
    // The old single-account view is unchanged.
    expect(store.getAll({ name: 'LRAFam', tag: '1337' }).map(r => r.riotName)).toEqual(['LRAFam'])
  })
})

describe('RecordingsStore.setDeadlockHero', () => {
  it('names the hero on the matching Deadlock recordings only, never with a raw key', () => {
    const store = new RecordingsStore()
    const dl = store.add({ ...recording('a', '1', 'deadlock'), matchId: '555', agent: 'hero_13' })
    const other = store.add({ ...recording('b', '2', 'deadlock'), matchId: '556', agent: 'hero_2' })
    expect(store.setDeadlockHero('555', 'hero_7')).toBe(0)
    expect(store.setDeadlockHero('555', 'Haze')).toBe(1)
    expect(store.getById(dl.id)?.agent).toBe('Haze')
    expect(store.getById(other.id)?.agent).toBe('hero_2')
  })
})

describe('riotAccountRole for League', () => {
  const lol = [{ name: 'LolMain', tag: 'EUW', isMain: true }, { name: 'LolSmurf', tag: 'EUW', isMain: false }]
  const lolRow = (riotName: string, riotTag: string) => ({ game: 'lol', riotName, riotTag, timeline: null }) as unknown as Parameters<typeof riotAccountRole>[0]

  it('uses the League accounts, not the Valorant ones', () => {
    expect(riotAccountRole(lolRow('LolMain', 'EUW'), linked, lol)).toBe('main')
    expect(riotAccountRole(lolRow('lolsmurf', 'euw'), linked, lol)).toBe('alt')
    expect(riotAccountRole(lolRow('LRAFam', '1337'), linked, lol)).toBeNull()
  })

  it('leaves League rows untagged when no League accounts are known', () => {
    expect(riotAccountRole(lolRow('LolMain', 'EUW'), linked)).toBeNull()
  })
})
