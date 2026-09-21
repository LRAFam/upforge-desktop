import { describe, expect, it } from 'vitest'
import fs from 'fs'
import vm from 'vm'
import ts from 'typescript'
import { RecordingPipelineSingleFlight } from './recording-pipeline-single-flight'

// Execute the real entry point without booting Electron or starting OBS.
const source = fs.readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
const start = source.indexOf('function doUploadAndAnalyse(')
const end = source.indexOf('\nfunction createSplashWindow()', start)
const compiled = ts.transpileModule(source.slice(start, end), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText

describe('upload preparation cleanup', () => {
  it.each([false, true])('cleans active state and retains a retry only for a capture pause (paused=%s)', async (paused) => {
    const active = new Set<string>()
    const retries = new Map<string, unknown>()
    const recording: { pipelineDeferReason?: string } = {}
    const context = vm.createContext({
      stopActiveAnalysisPoll() {}, authManager: { getUser: () => ({}) },
      recordingsStore: {
        getById: () => recording, clearPipelineDeferReason() { delete recording.pipelineDeferReason },
        setPipelineStatus() {}, setPipelineDeferReason(_id: string, reason: string) { recording.pipelineDeferReason = reason },
      },
      resolveUploadPlayerIdentity: () => ({ riotName: 'P', riotTag: 'T' }),
      settingsManager: { get: () => ({}) }, shouldDeferHeavyBackgroundWork: () => false,
      matchPriorityDeps: () => ({}), waitUntilBackgroundWorkAllowed: async () => {},
      mainWindow: null, logActivity() {}, log: { error() {}, warn() {} },
      registerDeferredUploadRetryPersisted: (id: string, retry: unknown) => retries.set(id, retry),
      clearDeferredUploadRetryPersisted: (id: string) => retries.delete(id),
      activeUploadRecordingIds: active,
      analysisPipelineSingleFlight: new RecordingPipelineSingleFlight(),
      clipExtractor: { probeWithRetry: async () => ({ ok: false, reason: 'Recording file is incomplete' }) },
      wasBackgroundWorkInterrupted: () => paused, sendUploadFailure() {},
      sendPostGameEventForRecording() {}, getActiveUserId: () => 1,
      POST_MATCH_COPY: { compressPaused: 'Paused' },
    })
    vm.runInContext(compiled, context)
    await context.doUploadAndAnalyse('rec', 'vod.mp4', 'P', 'T', 'valorant', null, null, null, {})
    expect(active.size).toBe(0)
    expect(retries.has('rec')).toBe(paused)
  })
})
