import { EventEmitter } from 'events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseCs2DemoInWorker, type Cs2DemoWorkerLike } from './cs2-demo-parse-client'

class FakeWorker extends EventEmitter implements Cs2DemoWorkerLike {
  terminated = false
  terminate() { this.terminated = true; return Promise.resolve(0) }
}

afterEach(() => { vi.useRealTimers() })

describe('parseCs2DemoInWorker', () => {
  it('returns the bundle the worker posts and terminates it', async () => {
    const w = new FakeWorker()
    const p = parseCs2DemoInWorker('/x.dem', { createWorker: async () => w })
    await Promise.resolve()
    w.emit('message', { ok: true, bundle: { header: { ok: true, value: {} } } })
    w.emit('exit', 0)
    await expect(p).resolves.toEqual({ status: 'ok', bundle: { header: { ok: true, value: {} } } })
    expect(w.terminated).toBe(true)
  })

  it('fails (not falls back) on a worker error', async () => {
    const w = new FakeWorker()
    const p = parseCs2DemoInWorker('/x.dem', { createWorker: async () => w })
    await Promise.resolve()
    w.emit('error', new Error('native crash'))
    await expect(p).resolves.toEqual({ status: 'failed', error: 'native crash' })
  })

  it('fails and terminates the worker on timeout', async () => {
    vi.useFakeTimers()
    const w = new FakeWorker()
    const p = parseCs2DemoInWorker('/x.dem', { createWorker: async () => w, timeoutMs: 1_000 })
    await vi.advanceTimersByTimeAsync(1_001)
    const result = await p
    expect(result.status).toBe('failed')
    expect(w.terminated).toBe(true)
  })

  it('reports unavailable when no worker can be created', async () => {
    const result = await parseCs2DemoInWorker('/x.dem', {
      createWorker: async () => { throw new Error('no worker') },
    })
    expect(result).toEqual({ status: 'unavailable', error: 'no worker' })
  })

  it('reports unavailable under vitest (no electron-vite worker path)', async () => {
    const result = await parseCs2DemoInWorker('/x.dem')
    expect(result.status).toBe('unavailable')
  })
})
