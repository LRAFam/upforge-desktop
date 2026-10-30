import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { RANKED_LOG_MAX, appendRankedGames, fileRankedLogStore, mergeRankedGames } from './valorant-ranked-log'

const u = (id: string, t: number, earned = 10) => ({ matchId: id, startTime: t, tierBefore: 12, tierAfter: 12, rrBefore: 40, rrAfter: 40 + earned, rrEarned: earned })
let dir = ''
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uf-ranked-log-')) })
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

describe('ranked log', () => {
  it('dedupes by match id, keeps oldest first and caps the size', () => {
    const many = Array.from({ length: RANKED_LOG_MAX + 5 }, (_, i) => u(`m${i}`, i))
    const merged = mergeRankedGames([], many)
    expect(merged).toHaveLength(RANKED_LOG_MAX)
    expect(merged[0].matchId).toBe('m5')
    expect(mergeRankedGames(merged, [u('m10', 10, -15)]).find(g => g.matchId === 'm10')?.rrEarned).toBe(-15)
  })

  it('starts a fresh log for another user or Riot account and survives a bad file', () => {
    const store = fileRankedLogStore(path.join(dir, 'log.json'))
    appendRankedGames(store, 1, 'puuid-a', [u('a', 1)])
    expect(appendRankedGames(store, 1, 'PUUID-A', [u('b', 2)]).map(g => g.matchId)).toEqual(['a', 'b'])
    expect(appendRankedGames(store, 2, 'puuid-a', [u('c', 3)]).map(g => g.matchId)).toEqual(['c'])
    fs.writeFileSync(path.join(dir, 'log.json'), '{nope')
    expect(store.read()).toBeNull()
  })
})
