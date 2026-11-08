import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SUPPORT_ACTIVITY_FLUSH_MS,
  createSupportActivityStore,
  readSupportActivity,
} from './support-activity-history'

const roots: string[] = []
function root() { const value = fs.mkdtempSync(path.join(os.tmpdir(), 'upforge-support-store-')); roots.push(value); return value }

function countingFsp() {
  const writes: string[] = []
  const fsp = {
    readFile: vi.fn(fs.promises.readFile),
    stat: vi.fn(fs.promises.stat),
    mkdir: vi.fn(fs.promises.mkdir),
    rename: vi.fn(fs.promises.rename),
    writeFile: vi.fn(async (...args: Parameters<typeof fs.promises.writeFile>) => {
      writes.push(String(args[0]))
      return fs.promises.writeFile(...args)
    }),
  }
  return { fsp: fsp as unknown as typeof fs.promises, writes }
}

/** Let real async fs work (threadpool) finish while fake timers are installed. */
async function settle() {
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r))
}

describe('support activity store', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }) })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    roots.forEach((value) => fs.rmSync(value, { recursive: true, force: true })); roots.length = 0
  })

  it('logActivity path does no sync fs work', () => {
    const syncCalls = [
      vi.spyOn(fs, 'readFileSync'), vi.spyOn(fs, 'writeFileSync'), vi.spyOn(fs, 'renameSync'),
      vi.spyOn(fs, 'statSync'), vi.spyOn(fs, 'mkdirSync'),
    ]
    const { fsp } = countingFsp()
    const store = createSupportActivityStore({ fsp })
    const dir = root()
    for (let i = 0; i < 200; i++) store.append(dir, { time: i, message: `event ${i}`, game: 'valorant' })
    for (const spy of syncCalls) expect(spy).not.toHaveBeenCalled()
  })

  it('writes at most once per 5 s under steady in-match logging and keeps history', async () => {
    const dir = root()
    fs.writeFileSync(path.join(dir, 'support-activity.json'), JSON.stringify([{ time: 0, message: 'previous session' }]))
    const { fsp, writes } = countingFsp()
    const store = createSupportActivityStore({ fsp })
    // 60 s of logging, one entry every 500 ms (120 entries).
    for (let t = 0; t < 60_000; t += 500) {
      store.append(dir, { time: t + 1, message: `tick ${t}` })
      await vi.advanceTimersByTimeAsync(500)
      await settle()
    }
    await vi.advanceTimersByTimeAsync(SUPPORT_ACTIVITY_FLUSH_MS)
    await settle()
    expect(writes.length).toBeLessThanOrEqual(60_000 / SUPPORT_ACTIVITY_FLUSH_MS + 1)
    expect(writes.length).toBeGreaterThan(0)
    const saved = readSupportActivity(dir)
    expect(saved[0]?.message).toBe('previous session')
    expect(saved.at(-1)?.message).toBe('tick 59500')
    expect(saved).toHaveLength(121)
  })

  it('flushSync on quit persists entries that the timer has not written yet', async () => {
    const dir = root()
    const store = createSupportActivityStore()
    store.append(dir, { time: 1, message: 'token=private-secret before quit' })
    await settle() // async history read finishes
    store.flushSync()
    const saved = readSupportActivity(dir)
    expect(saved.map((e) => e.message)).toHaveLength(1)
    expect(fs.readFileSync(path.join(dir, 'support-activity.json'), 'utf8')).not.toMatch(/private-secret/)
  })

  it('flushSync before the history read finished merges disk history', () => {
    const dir = root()
    fs.writeFileSync(path.join(dir, 'support-activity.json'), JSON.stringify([{ time: 0, message: 'older' }]))
    const store = createSupportActivityStore()
    store.append(dir, { time: 1, message: 'newest' })
    store.flushSync()
    expect(readSupportActivity(dir).map((e) => e.message)).toEqual(['older', 'newest'])
  })

  it('read() includes unflushed entries and keeps profiles separate; bounds count', async () => {
    const one = root(); const two = root()
    const store = createSupportActivityStore()
    for (let i = 0; i < 600; i++) store.append(one, { time: i, message: 'entry' })
    store.append(two, { time: 1, message: 'another user' })
    const read = store.read(one)
    await settle()
    const entries = await read
    expect(entries).toHaveLength(500)
    expect(entries.at(-1)?.time).toBe(599)
    const other = store.read(two)
    await settle()
    expect((await other).map((e) => e.message)).toEqual(['another user'])
    const flushed = store.flush()
    await settle()
    await flushed
    expect(readSupportActivity(one)).toHaveLength(500)
  })

  it('tolerates an unwritable profile path', async () => {
    const file = path.join(root(), 'not-a-directory'); fs.writeFileSync(file, '')
    const store = createSupportActivityStore()
    expect(() => store.append(file, { time: 1, message: 'capture continues' })).not.toThrow()
    const flushed = store.flush()
    await settle()
    await expect(flushed).resolves.toBeUndefined()
    expect(() => store.flushSync()).not.toThrow()
  })
})
