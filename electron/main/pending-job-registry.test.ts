import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { readPendingJobRegistry, removePendingJobEntry, savePendingJobEntry } from './pending-job-registry'

const dirs: string[] = []
function file(owner = 1): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pending-jobs-'))
  dirs.push(root)
  return path.join(root, String(owner), 'pending-job.json')
}
afterEach(() => { for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }) })

describe('durable pending jobs', () => {
  it('recovers two uploads after restart and completing one preserves the other', () => {
    const target = file()
    savePendingJobEntry(target, 1, { job_id: 'first', savedAt: 100, game: 'valorant' })
    savePendingJobEntry(target, 1, { job_id: 'second', savedAt: 200, game: 'cs2' })
    expect(readPendingJobRegistry(target, 1).map(job => job.job_id)).toEqual(['first', 'second'])
    removePendingJobEntry(target, 1, 'first')
    expect(readPendingJobRegistry(target, 1)).toEqual([{ job_id: 'second', savedAt: 200, game: 'cs2' }])
  })
  it('migrates the legacy single-job payload without losing it or resetting age', () => {
    const target = file()
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, JSON.stringify({ job_id: 'legacy', savedAt: 100 }))
    savePendingJobEntry(target, 1, { job_id: 'new', savedAt: 200 })
    savePendingJobEntry(target, 1, { job_id: 'legacy', savedAt: 300, map: 'Haven' })
    expect(readPendingJobRegistry(target, 1)).toContainEqual({ job_id: 'legacy', savedAt: 100, map: 'Haven' })
    expect(readPendingJobRegistry(target, 1)).toHaveLength(2)
  })
  it('account changes cannot clear or import a different owners jobs', () => {
    const a = file(1), b = file(2)
    savePendingJobEntry(a, 1, { job_id: 'same-id', savedAt: 100 })
    savePendingJobEntry(b, 2, { job_id: 'same-id', savedAt: 200 })
    expect(() => readPendingJobRegistry(a, 2)).toThrow('differently owned')
    removePendingJobEntry(a, 1, 'same-id')
    expect(readPendingJobRegistry(b, 2)).toHaveLength(1)
  })
  it('leaves malformed recovery data untouched instead of overwriting it', () => {
    const target = file()
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, '{broken')
    expect(() => savePendingJobEntry(target, 1, { job_id: 'new', savedAt: 1 })).toThrow()
    expect(fs.readFileSync(target, 'utf8')).toBe('{broken')
  })
})
