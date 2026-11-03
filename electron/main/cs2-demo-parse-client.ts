/**
 * Main-process side of the CS2 demo parse worker. One worker per parse, killed on timeout.
 * 'unavailable' means no worker could be started at all (e.g. under vitest); callers may then
 * parse on the main thread. 'failed' means the worker ran and failed: do not retry on main.
 */
import { Worker } from 'worker_threads'
import type { Cs2DemoBundle } from './cs2-demo-source'

export const CS2_DEMO_PARSE_TIMEOUT_MS = 120_000

export type Cs2DemoParseResult =
  | { status: 'ok'; bundle: Cs2DemoBundle }
  | { status: 'failed'; error: string }
  | { status: 'unavailable'; error: string }

/** Minimal Worker surface so tests can fake it. */
export interface Cs2DemoWorkerLike {
  on(event: 'message', fn: (msg: unknown) => void): unknown
  on(event: 'error', fn: (err: Error) => void): unknown
  on(event: 'exit', fn: (code: number) => void): unknown
  terminate(): Promise<number> | unknown
}

export type Cs2DemoWorkerFactory = (demoPath: string) => Promise<Cs2DemoWorkerLike>

const defaultFactory: Cs2DemoWorkerFactory = async (demoPath) => {
  const { default: workerPath } = await import('./cs2-demo-parse-worker-path')
  if (typeof workerPath !== 'string' || !workerPath) throw new Error('worker path unavailable')
  return new Worker(workerPath, { workerData: { upforgeCs2DemoParse: true, demoPath } })
}

export async function parseCs2DemoInWorker(
  demoPath: string,
  opts: { timeoutMs?: number; createWorker?: Cs2DemoWorkerFactory } = {},
): Promise<Cs2DemoParseResult> {
  let worker: Cs2DemoWorkerLike
  try {
    worker = await (opts.createWorker ?? defaultFactory)(demoPath)
  } catch (err) {
    return { status: 'unavailable', error: err instanceof Error ? err.message : String(err) }
  }
  const timeoutMs = opts.timeoutMs ?? CS2_DEMO_PARSE_TIMEOUT_MS
  return new Promise<Cs2DemoParseResult>((resolve) => {
    let settled = false
    const finish = (result: Cs2DemoParseResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try { void worker.terminate() } catch { /* already gone */ }
      resolve(result)
    }
    const timer = setTimeout(() => {
      finish({ status: 'failed', error: `demo parse timed out after ${Math.round(timeoutMs / 1000)} s` })
    }, timeoutMs)
    worker.on('message', (msg: unknown) => {
      const m = msg as { ok?: boolean; bundle?: Cs2DemoBundle; error?: string } | null
      if (m?.ok && m.bundle) finish({ status: 'ok', bundle: m.bundle })
      else finish({ status: 'failed', error: m?.error ?? 'worker returned no data' })
    })
    worker.on('error', (err: Error) => finish({ status: 'failed', error: err.message }))
    worker.on('exit', (code: number) => finish({ status: 'failed', error: `worker exited (code ${code})` }))
  })
}
