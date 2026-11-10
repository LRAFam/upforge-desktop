/**
 * worker_threads entry: runs every demoparser2 call for one CS2 demo off the Electron main thread.
 * Imports only Node + demoparser2 (no electron / electron-log — they do not load in workers).
 */
import fs from 'fs'
import { hasSource2DemoPreambleBytes } from './source2-demo-preamble'
import { parentPort, workerData } from 'worker_threads'
import { collectCs2DemoBundle, nativeCs2DemoSource } from './cs2-demo-source'

const data = workerData as { upforgeCs2DemoParse?: boolean; demoPath?: unknown } | null
// Only act when started by cs2-demo-parse-client (test runners also run inside worker threads).
if (parentPort && data?.upforgeCs2DemoParse === true) {
  const demoPath = data.demoPath
  try {
    if (typeof demoPath !== 'string' || !demoPath) throw new Error('demoPath missing')
    // Read once: each demoparser2 call would otherwise re-read the whole file from disk.
    const buf = fs.readFileSync(demoPath)
    if (!hasSource2DemoPreambleBytes(buf)) throw new Error('Unsupported or truncated Source-2 demo preamble')
    parentPort.postMessage({ ok: true, bundle: collectCs2DemoBundle(nativeCs2DemoSource(buf)) })
  } catch (err) {
    parentPort.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
