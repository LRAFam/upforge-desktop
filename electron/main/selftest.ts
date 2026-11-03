/**
 * Packaged-app self-tests, run by CI against `electron-builder --dir` output:
 *
 *   UPFORGE_SELFTEST=1 UpForge.exe --selftest=demo-worker
 *
 * Both the env var and the flag are required, so a stray argv can never switch a user's app into
 * test mode. In this mode index.ts skips the instance lock, protocol registration and startApp;
 * error reporting is off (error-reporter.ts) and userData/logs go to a temp folder.
 *
 * demo-worker: starts the CS2 demo parse worker exactly as production does
 * (parseCs2DemoInWorker → `?modulePath` chunk → demoparser2 native addon) on a tiny synthetic demo,
 * prints one JSON line to stdout (and UPFORGE_SELFTEST_OUT if set), exits 0 on success, 1 otherwise.
 */
import fs from 'fs'
import os from 'os'
import { join } from 'path'
import { parseCs2DemoInWorker, type Cs2DemoParseResult } from './cs2-demo-parse-client'
import { HEADER_KEY, type Cs2DemoBundle } from './cs2-demo-source'

export { parseSelftestRequest, type SelftestName } from './selftest-request'
import type { SelftestName } from './selftest-request'

export const SELFTEST_DEMO_MAP = 'de_upforge_selftest'

function varint(n: number): Buffer {
  const out: number[] = []
  do {
    let b = n & 0x7f
    n >>>= 7
    if (n) b |= 0x80
    out.push(b)
  } while (n)
  return Buffer.from(out)
}

function pbString(field: number, value: string): Buffer {
  const bytes = Buffer.from(value, 'utf8')
  return Buffer.concat([varint((field << 3) | 2), varint(bytes.length), bytes])
}

function pbInt(field: number, value: number): Buffer {
  return Buffer.concat([varint(field << 3), varint(value)])
}

function demoFrame(cmd: number, tick: number, data: Buffer): Buffer {
  return Buffer.concat([varint(cmd), varint(tick), varint(data.length), data])
}

/**
 * Smallest CS2 demo demoparser2 accepts: the PBDEMS2 preamble, a DEM_FileHeader frame and
 * DEM_Stop. parseHeader reads it; every entity/event call fails cleanly (no class info), which is
 * fine — the self-test proves the worker + native addon load, not game parsing.
 * The committed copy is electron/main/__fixtures__/cs2-selftest.dem (see selftest.test.ts).
 */
export function buildSelftestCs2Demo(): Buffer {
  const header = Buffer.concat([
    pbString(1, 'PBDEMS2'), // demo_file_stamp
    pbInt(2, 14000), // network_protocol
    pbString(3, 'UpForge self-test'), // server_name
    pbString(4, 'SourceTV Demo'), // client_name
    pbString(5, SELFTEST_DEMO_MAP), // map_name
    pbString(6, 'csgo'), // game_directory
  ])
  const preamble = Buffer.alloc(16) // magic + two int32 offsets (unused by the parser)
  preamble.write('PBDEMS2\0', 0, 'latin1')
  return Buffer.concat([preamble, demoFrame(1, 0, header), demoFrame(0, 0, Buffer.alloc(0))])
}

export interface DemoWorkerSelftestResult {
  selftest: 'demo-worker'
  ok: boolean
  status: Cs2DemoParseResult['status'] | 'error'
  mapName: string | null
  bundleEntries: number
  failedEntries: number
  ms: number
  error?: string
}

export function evaluateDemoWorkerResult(result: Cs2DemoParseResult, ms: number): DemoWorkerSelftestResult {
  if (result.status !== 'ok') {
    return { selftest: 'demo-worker', ok: false, status: result.status, mapName: null, bundleEntries: 0, failedEntries: 0, ms, error: result.error }
  }
  const bundle: Cs2DemoBundle = result.bundle
  const entries = Object.values(bundle)
  const header = bundle[HEADER_KEY]
  const mapName = header?.ok ? String((header.value as { map_name?: unknown } | null)?.map_name ?? '') || null : null
  const ok = mapName === SELFTEST_DEMO_MAP
  return {
    selftest: 'demo-worker',
    ok,
    status: 'ok',
    mapName,
    bundleEntries: entries.length,
    failedEntries: entries.filter(e => !e.ok).length,
    ms,
    ...(ok ? {} : { error: header && !header.ok ? `header parse failed: ${header.error}` : `unexpected map_name ${mapName}` }),
  }
}

export async function runDemoWorkerSelftest(opts: { timeoutMs?: number } = {}): Promise<DemoWorkerSelftestResult> {
  const started = Date.now()
  const dir = fs.mkdtempSync(join(os.tmpdir(), 'upforge-selftest-'))
  const demoPath = join(dir, 'selftest.dem')
  try {
    fs.writeFileSync(demoPath, buildSelftestCs2Demo())
    const result = await parseCs2DemoInWorker(demoPath, { timeoutMs: opts.timeoutMs ?? 60_000 })
    return evaluateDemoWorkerResult(result, Date.now() - started)
  } catch (err) {
    return {
      selftest: 'demo-worker', ok: false, status: 'error', mapName: null, bundleEntries: 0, failedEntries: 0,
      ms: Date.now() - started, error: err instanceof Error ? err.message : String(err),
    }
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* temp */ }
  }
}

/** Runs the requested self-test, prints the JSON result and returns the exit code. */
export async function runSelftest(
  name: SelftestName,
  meta: Record<string, unknown>,
  out: { write: (line: string) => void; file?: string } = { write: (line) => process.stdout.write(line) },
): Promise<number> {
  const result = name === 'demo-worker' ? await runDemoWorkerSelftest() : null
  const line = JSON.stringify({ ...meta, ...result }) + '\n'
  try { out.write(line) } catch { /* stdout may be closed on Windows GUI builds */ }
  if (out.file) {
    try { fs.writeFileSync(out.file, line) } catch { /* reported by the missing file in CI */ }
  }
  return result?.ok ? 0 : 1
}
