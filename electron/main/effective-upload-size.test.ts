import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MAX_RECORDING_FILE_BYTES } from './recording-preset'

// Execute the real upload preparation path, stopping at upload-start so no network request occurs.
const source = fs.readFileSync(new URL('./main-analysis.ts', import.meta.url), 'utf8')
const ast = ts.createSourceFile('main-analysis.ts', source, ts.ScriptTarget.Latest, true)
let fn!: ts.FunctionDeclaration
function find(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'performUploadAndAnalyse') fn = node
  ts.forEachChild(node, find)
}
find(ast)
const code = ts.transpileModule(`${fn.getText(ast)}\nglobalThis.run = performUploadAndAnalyse`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText
const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }) })
function fixture(originalSize: number, preparedSize: number, preparedReadable: boolean) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upforge-size-regression-'))
  dirs.push(dir)
  const original = path.join(dir, 'match.mkv'), prepared = path.join(dir, 'match_upforge.mp4')
  for (const [file, size] of [[original, originalSize], [prepared, preparedSize]] as const) {
    fs.writeFileSync(file, ''); fs.truncateSync(file, size) // Sparse files, no multi-GB fixture allocation.
  }
  const upload = new Error('TEST_UPLOAD_BOUNDARY')
  const sendFailure = vi.fn(), clips = vi.fn(async () => {})
  const ctx = vm.createContext({ fs, stopActiveAnalysisPoll() {}, authManager: { getUser: () => ({}) },
    resolveUploadPlayerIdentity: () => ({ riotName: 'Player', riotTag: 'Test' }), settingsManager: { get: () => ({}) },
    matchPriorityDeps: () => ({}), waitUntilBackgroundWorkAllowed: async () => {}, activeMatchTelemetry: null,
    clipExtractor: { probeWithRetry: async () => ({ ok: true }), probe: async () => ({ ok: preparedReadable, reason: 'unreadable sibling' }) },
    resolveUploadVideoPath: async () => ({ path: prepared, sizeBytes: preparedSize, compressed: true }),
    MAX_RECORDING_FILE_BYTES, formatRecordingTooLargeMessage: (bytes: number) => `Too large: ${bytes}`,
    log: { warn() {}, error() {} }, logActivity() {}, extractMatchClips: clips, sendUploadFailure: sendFailure,
    wasBackgroundWorkInterrupted: () => false, RecordingPreparationError: class extends Error {},
    sendPostGameEvent: (_window: unknown, channel: string) => { if (channel === 'post-game:upload-start') throw upload },
    lastMatchDiagnostic: null,
  })
  ctx.mainProcess = ctx
  vm.runInContext(code, ctx)
  return { original, prepared, upload, sendFailure, clips,
    run: () => ctx.run(null, original, 'Player', 'Test', 'valorant', null, null, null, null) }
}

describe('size gate follows the actual file selected for upload', () => {
  it('rejects an oversized original when an unreadable smaller prepared sibling is discarded', async () => {
    const f = fixture(MAX_RECORDING_FILE_BYTES + 1, 1024, false)
    expect(await f.run()).toBeNull()
    expect(f.sendFailure).toHaveBeenCalledWith(`Too large: ${MAX_RECORDING_FILE_BYTES + 1}`, expect.objectContaining({ clipsOnly: true }))
    expect(f.clips).toHaveBeenCalledWith(f.original, null, null, 'valorant')
    expect(fs.existsSync(f.original)).toBe(true)
    expect(fs.statSync(f.original).size).toBe(MAX_RECORDING_FILE_BYTES + 1)
  })
  it('allows the original exactly at the cap when a larger unreadable sibling is discarded', async () => {
    const f = fixture(MAX_RECORDING_FILE_BYTES, MAX_RECORDING_FILE_BYTES + 1, false)
    await expect(f.run()).rejects.toBe(f.upload)
    expect(f.sendFailure).not.toHaveBeenCalled()
  })
  it('allows a valid small compressed sibling while retaining the oversized source', async () => {
    const f = fixture(MAX_RECORDING_FILE_BYTES + 1, 1024, true)
    await expect(f.run()).rejects.toBe(f.upload)
    expect(fs.existsSync(f.original)).toBe(true)
  })
  it('still rejects a prepared file above the cap', async () => {
    const f = fixture(MAX_RECORDING_FILE_BYTES + 2, MAX_RECORDING_FILE_BYTES + 1, true)
    expect(await f.run()).toBeNull()
    expect(f.clips).toHaveBeenCalledWith(f.prepared, null, null, 'valorant')
    expect(fs.existsSync(f.original)).toBe(true)
  })
})
