import { describe, expect, it } from 'vitest'
import { addReady, pruneReady, readReadyFile, removeReady, writeReadyFile, type ReadyAnalysis } from './ready-analyses'

const NOW = Date.parse('2026-11-07T12:00:00Z')
const item = (id: number, daysAgo = 0): ReadyAnalysis => ({
  analysisId: id,
  game: 'valorant',
  label: 'Jett',
  map: 'Ascent',
  readyAt: new Date(NOW - daysAgo * 86_400_000).toISOString(),
})

describe('ready analyses', () => {
  it('adds newest first without duplicates', () => {
    const list = addReady(addReady([item(1)], item(2), NOW), item(1), NOW)
    expect(list.map(r => r.analysisId)).toEqual([1, 2])
  })

  it('caps the list at 10', () => {
    let list: ReadyAnalysis[] = []
    for (let i = 1; i <= 12; i++) list = addReady(list, item(i), NOW)
    expect(list).toHaveLength(10)
    expect(list[0].analysisId).toBe(12)
  })

  it('drops entries older than a week and junk from old settings files', () => {
    expect(pruneReady([item(1, 8), item(2, 1), { analysisId: 'x' }, null], NOW).map(r => r.analysisId)).toEqual([2])
    expect(pruneReady(undefined, NOW)).toEqual([])
  })

  it('removes an opened analysis', () => {
    expect(removeReady([item(1), item(2)], 1, NOW).map(r => r.analysisId)).toEqual([2])
  })

  it('ignores invalid ids', () => {
    expect(addReady([], item(0), NOW)).toEqual([])
  })
})

describe('ready analyses file', () => {
  it('round-trips and survives a missing or broken file', async () => {
    const os = await import('os'); const fs = await import('fs'); const path = await import('path')
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ready-'))
    const file = path.join(dir, 'users', '2', 'ready-analyses.json')
    expect(readReadyFile(file, NOW)).toEqual([])
    writeReadyFile(file, [item(7)])
    expect(readReadyFile(file, NOW).map(r => r.analysisId)).toEqual([7])
    fs.writeFileSync(file, '{oops')
    expect(readReadyFile(file, NOW)).toEqual([])
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
