import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogueWriter } from './recordings-store-files'

let dir: string
let writer: CatalogueWriter
let indexPath: string
let mediaPath: string
const oldIndex = JSON.stringify([{ id: 'old', title: 'Preserved catalogue' }])
const sourceBytes = Buffer.from('original recording bytes must survive catalogue failure')
const diskFull = () => Object.assign(new Error('write ENOSPC'), { code: 'ENOSPC' })

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'catalogue-recovery-'))
  indexPath = path.join(dir, 'recordings.json')
  mediaPath = path.join(dir, 'recording.mp4')
  fs.writeFileSync(indexPath, oldIndex)
  fs.writeFileSync(mediaPath, sourceBytes)
  writer = new CatalogueWriter(indexPath)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  writer.discard()
  vi.restoreAllMocks()
  vi.useRealTimers()
  fs.rmSync(dir, { recursive: true, force: true })
})

function scheduleNewRows() {
  const rows = [{ id: 'new', path: mediaPath, timeline: { game: 'valorant', events: ['full timeline'] } }]
  writer.markTimelineDirty('new')
  writer.schedule(() => rows)
  return rows
}

function assertPreserved() {
  expect(fs.readFileSync(indexPath, 'utf8')).toBe(oldIndex)
  expect(fs.readFileSync(mediaPath)).toEqual(sourceBytes)
}

function assertRecovered() {
  expect(JSON.parse(fs.readFileSync(indexPath, 'utf8'))).toEqual([
    expect.objectContaining({ id: 'new', path: mediaPath, hasTimeline: true }),
  ])
  expect(JSON.parse(fs.readFileSync(path.join(dir, 'timelines/new.json'), 'utf8')))
    .toEqual({ game: 'valorant', events: ['full timeline'] })
  expect(fs.readFileSync(mediaPath)).toEqual(sourceBytes)
  expect(writer.pending).toBe(false)
}

describe('catalogue recovery after an async disk failure', () => {
  for (const operation of ['timeline write', 'index write', 'timeline rename', 'index rename'] as const) {
    for (const recovery of ['async', 'quit sync'] as const) {
      it(`retains pending work after ${operation} and recovers with ${recovery}`, async () => {
        scheduleNewRows()
        const failTimeline = operation.startsWith('timeline')
        const failsPath = (file: unknown) => failTimeline
          ? String(file).includes(`${path.sep}timelines${path.sep}`)
          : String(file).startsWith(indexPath)
        let unavailable = true
        if (operation.endsWith('write')) {
          const original = fs.promises.writeFile.bind(fs.promises)
          vi.spyOn(fs.promises, 'writeFile').mockImplementation(async (...args) => {
            if (unavailable && failsPath(args[0])) throw diskFull()
            return original(...args)
          })
        } else {
          const original = fs.promises.rename.bind(fs.promises)
          vi.spyOn(fs.promises, 'rename').mockImplementation(async (...args) => {
            if (unavailable && failsPath(args[1])) throw diskFull()
            return original(...args)
          })
        }
        await writer.flush()
        assertPreserved()
        expect(writer.pending).toBe(true)
        unavailable = false
        if (recovery === 'async') await writer.flush()
        else writer.flushSync({ throwOnError: true })
        assertRecovered()
      })
    }
  }

  it('does not automatically retry a persistent failure', async () => {
    vi.useFakeTimers()
    scheduleNewRows()
    const writes = vi.spyOn(fs.promises, 'writeFile').mockRejectedValue(diskFull())
    await writer.flush()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(writes).toHaveBeenCalledTimes(1)
    expect(writer.pending).toBe(true)
    assertPreserved()
  })

  it.each([false, true])('keeps newer rows during failure (retry already queued: %s)', async (queueRetry) => {
    const rows = scheduleNewRows()
    let rejectWrite!: (error: Error) => void
    let started!: () => void
    const writing = new Promise<void>((resolve) => { started = resolve })
    const original = fs.promises.writeFile.bind(fs.promises)
    vi.spyOn(fs.promises, 'writeFile').mockImplementationOnce(() => {
      started()
      return new Promise<void>((_resolve, reject) => { rejectWrite = reject })
    }).mockImplementation(original)
    const earlierFlush = writer.flush()
    await writing
    const newerRows = [...rows, { id: 'newer', path: mediaPath, timeline: { game: 'valorant', events: ['newer'] } }]
    writer.markTimelineDirty('newer')
    writer.schedule(() => newerRows)
    const queuedFlush = queueRetry ? writer.flush() : null
    rejectWrite(diskFull())
    await earlierFlush
    if (queuedFlush) await queuedFlush
    else {
      assertPreserved()
      expect(writer.pending).toBe(true)
      await writer.flush()
    }
    expect(JSON.parse(fs.readFileSync(indexPath, 'utf8')).map((row: { id: string }) => row.id))
      .toEqual(['new', 'newer'])
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'timelines/new.json'), 'utf8'))).toEqual(rows[0].timeline)
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'timelines/newer.json'), 'utf8'))).toEqual(newerRows[1].timeline)
    expect(fs.readFileSync(mediaPath)).toEqual(sourceBytes)
    // An already queued successful write may leave the recovered pending marker set.
    // A later explicit flush safely drains it without dropping newer data.
    await writer.flush()
    expect(writer.pending).toBe(false)
  })
})
