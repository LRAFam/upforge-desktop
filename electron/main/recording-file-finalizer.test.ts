import { describe, expect, it, vi } from 'vitest'
import { createRecordingFileFinalizer, type FinalizingFileRow } from './recording-file-finalizer'

function setup() {
  let owner = 1, now = 0, activeCapture = false
  let revision = { size: 0, mtimeMs: 0 }
  const row: FinalizingFileRow = { id: 'match', path: '/owned/match.mp4', fileFinalizing: true }
  const complete = vi.fn(async () => { row.fileFinalizing = false })
  const probe = vi.fn(async () => ({ ok: true }))
  const deps = { owner: () => owner, rows: () => [row], canWork: () => !activeCapture,
    stat: async () => ({ ...revision }), probe, complete, now: () => now }
  return { row, deps, complete, probe, owner: (v: number) => { owner = v }, clock: (v: number) => { now = v },
    capture: (v: boolean) => { activeCapture = v }, file: (size: number, mtimeMs = size) => { revision = { size, mtimeMs } } }
}

describe('durable stopped-file finalization', () => {
  it('finishes a file after the original 45s deadline and a fresh watcher restart', async () => {
    const s = setup()
    await createRecordingFileFinalizer(s.deps).tick()
    s.clock(60_000)
    s.file(100)
    const restarted = createRecordingFileFinalizer(s.deps)
    await restarted.tick()
    expect(s.complete).not.toHaveBeenCalled()
    s.clock(62_000)
    await restarted.tick()
    expect(s.complete).toHaveBeenCalledWith('match', 1)
    expect(s.row.fileFinalizing).toBe(false)
  })

  it('never completes a still-growing file or an unreadable mux', async () => {
    const s = setup(), worker = createRecordingFileFinalizer(s.deps)
    for (let i = 1; i <= 30; i++) { s.clock(i * 3000); s.file(i); await worker.tick() }
    expect(s.probe).not.toHaveBeenCalled()
    s.clock(100_000)
    s.probe.mockResolvedValue({ ok: false })
    await worker.tick()
    expect(s.complete).not.toHaveBeenCalled()
    expect(s.row.fileFinalizing).toBe(true)
  })

  it('leaves a later capture free to run and retries the old file afterwards', async () => {
    const s = setup(), worker = createRecordingFileFinalizer(s.deps)
    s.file(100); await worker.tick(); s.clock(5000); s.capture(true)
    await worker.tick()
    expect(s.probe).not.toHaveBeenCalled()
    s.capture(false); await worker.tick()
    expect(s.complete).toHaveBeenCalledOnce()
  })

  it('does not complete or publish an old owner response after account switching', async () => {
    const s = setup(), worker = createRecordingFileFinalizer(s.deps)
    s.file(100); await worker.tick(); s.clock(5000)
    s.probe.mockImplementation(async () => { s.owner(2); return { ok: true } })
    await worker.tick()
    expect(s.complete).not.toHaveBeenCalled()
    expect(s.row.fileFinalizing).toBe(true)
  })

  it('rechecks the file revision after probing before releasing it', async () => {
    const s = setup(), worker = createRecordingFileFinalizer(s.deps)
    s.file(100); await worker.tick(); s.clock(5000)
    s.probe.mockImplementation(async () => { s.file(200); return { ok: true } })
    await worker.tick()
    expect(s.complete).not.toHaveBeenCalled()
  })
})
