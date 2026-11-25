import { readMainRuntimeSource } from './__tests__/main-runtime-source'
import { describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import vm from 'vm'
import ts from 'typescript'
import { asCompletedPollStatus, isTerminalPollSuccess } from './analysis-completion'
import { classifyActivationError } from './activation-error-codes'
import { buildAnalysisErrorPayload, classifyAnalysisFailure, type AnalysisErrorPayload } from '../../src/lib/analysis-failure-messages'

// Exercise the registered production handler without starting Electron, OBS or background services.
const source = ts.createSourceFile('index.ts', readMainRuntimeSource('main-startup.ts', 'main-analysis-notifications.ts'), ts.ScriptTarget.Latest, true)
function compile(select: (node: ts.Node) => boolean): string {
  const selected: string[] = []
  function visit(node: ts.Node): void {
    if (select(node)) selected.push(node.getText(source))
    else ts.forEachChild(node, visit)
  }
  visit(source)
  if (!selected.length) throw new Error('Production handler was not found')
  return ts.transpileModule(selected.join('\n'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText
}
const analyseCode = compile(node => ts.isExpressionStatement(node)
  && ts.isCallExpression(node.expression)
  && node.expression.expression.getText(source) === 'ipcMain.handle'
  && ts.isStringLiteral(node.expression.arguments[0]!)
  && node.expression.arguments[0].text === 'recordings:analyse')
const failureCode = compile(node => ts.isFunctionDeclaration(node)
  && ['titleForActivationCode', 'dispatchAnalysisFailure', 'sendUploadFailure'].includes(node.name?.text ?? ''))

function setup(status: Record<string, unknown> | Error, lastError: string | null = null) {
  let owner = 7
  const recording = {
    id: 'recording', path: '/saved/match.mp4', game: 'cs2', map: null, agent: null,
    riotName: 'Player', riotTag: 'EU', timeline: null, jobId: 'existing-job' as string | null,
    analysed: true, lastAnalysisError: lastError, lastFailureCode: null,
    pipelineStatus: 'analysing', manualAnalyseRequested: false,
  }
  const active = new Set<string>()
  const store = {
    getById: () => recording,
    clearAnalysisFailure: vi.fn(() => { recording.lastAnalysisError = null }),
    markAnalysed: vi.fn((_id: string, jobId: string) => { recording.analysed = true; recording.jobId = jobId }),
    setManualAnalyseRequested: vi.fn((_id: string, value: boolean) => { recording.manualAnalyseRequested = value }),
  }
  const poll = vi.fn(async () => { if (status instanceof Error) throw status; return status })
  const retry = vi.fn(async () => {})
  const enqueue = vi.fn()
  const resume = vi.fn(async () => {})
  const completed = vi.fn()
  const readiness = vi.fn(async () => ({ ok: true, recording }))
  const startPoll = vi.fn()
  let handler!: (_event: unknown, input: { id: string }) => Promise<Record<string, unknown>>
  const context = vm.createContext({
    Error, ipcMain: { handle: (_channel: string, callback: typeof handler) => { handler = callback } },
    productionVodFixtures: { getById: () => null }, recordingsStore: store,
    submissionFocusAreas: () => undefined, getActiveUserId: () => owner,
    uploadManager: { pollStatus: poll, retrySubmission: retry },
    activeUploadRecordingIds: active, isTerminalPollSuccess, asCompletedPollStatus,
    dismissMatchWaitUi: vi.fn(), dispatchReconciledAnalysisReady: completed, resumePollForJob: resume,
    ensureAnalysisReadinessForAnalyse: readiness, matchCapturePriority: false,
    obsRecorder: { isActivelyRecording: () => false },
    authManager: { getUser: () => ({}) }, bindPostGameSessionToRecording: vi.fn(),
    postGameWindow: { isDestroyed: () => false, show: vi.fn(), focus: vi.fn() },
    stopActiveAnalysisPoll: vi.fn(), sendPostGameEventForRecording: vi.fn(),
    logActivity: vi.fn(), tray: null, startAnalysisPoll: startPoll, mainWindow: null,
    sendUploadFailure: vi.fn(), enqueuePostMatchAnalyse: enqueue, notifyRecordingsUpdated: vi.fn(),
    resolveUploadPlayerIdentity: () => ({ riotName: 'Player', riotTag: 'EU' }),
  })
  context.mainProcess = context
  vm.runInContext(analyseCode, context)
  return { run: () => handler(null, { id: recording.id }), recording, store, poll, retry, enqueue, resume, completed, readiness, startPoll, active, owner: (value: number) => { owner = value } }
}

describe('recordings:analyse saved-job reconciliation', () => {
  it.each(['queued', 'processing'])('resumes %s without creating another job, even when no local failure exists', async status => {
    const s = setup({ status })
    expect(await s.run()).toEqual({ ok: true })
    expect(s.poll).toHaveBeenCalledWith('existing-job')
    expect(s.resume).toHaveBeenCalledWith('existing-job', expect.any(Object))
    expect(s.enqueue).not.toHaveBeenCalled()
    expect(s.retry).not.toHaveBeenCalled()
    expect(s.readiness).not.toHaveBeenCalled()
  })

  it('opens the completed saved result without uploading or retrying it', async () => {
    const s = setup({ status: 'completed', analysis_log_id: 123 })
    expect(await s.run()).toEqual({ ok: true })
    expect(s.completed).toHaveBeenCalledWith(expect.objectContaining({ jobId: 'existing-job', recordingId: 'recording' }))
    expect(s.enqueue).not.toHaveBeenCalled()
    expect(s.retry).not.toHaveBeenCalled()
  })

  it.each([null, 'Previous connection failure'])('keeps saved state when the status request fails (local error: %s)', async lastError => {
    const s = setup(new Error('Request failed (503)'), lastError)
    expect(await s.run()).toMatchObject({ code: 'upload_status_unconfirmed' })
    expect(s.enqueue).not.toHaveBeenCalled()
    expect(s.retry).not.toHaveBeenCalled()
    expect(s.store.clearAnalysisFailure).not.toHaveBeenCalled()
    expect(s.recording.jobId).toBe('existing-job')
    expect(s.recording.lastAnalysisError).toBe(lastError)
  })

  it.each([null, 'Previous failure'])('uploads again when the server no longer has the saved job (local error: %s)', async lastError => {
    const s = setup(new Error('Job not found'), lastError)
    expect(await s.run()).toEqual({ ok: true })
    expect(s.store.clearAnalysisFailure).toHaveBeenCalled()
    expect(s.enqueue).toHaveBeenCalledWith(expect.objectContaining({ recordingId: 'recording', requestKind: 'manual' }))
    expect(s.retry).not.toHaveBeenCalled()
    expect(s.resume).not.toHaveBeenCalled()
  })

  it('does not create another job from an unrecognised status', async () => {
    const s = setup({ status: 'unknown' }, 'Previous failure')
    expect(await s.run()).toMatchObject({ code: 'upload_status_unconfirmed' })
    expect(s.enqueue).not.toHaveBeenCalled()
    expect(s.store.clearAnalysisFailure).not.toHaveBeenCalled()
  })

  it.each([null, 'Analysis failed and credit was refunded'])('retries a confirmed failed job in the cloud (local error: %s)', async lastError => {
    const s = setup({ status: 'failed', error: 'Analysis failed' }, lastError)
    expect(await s.run()).toEqual({ ok: true })
    await vi.waitFor(() => expect(s.startPoll).toHaveBeenCalled())
    expect(s.retry).toHaveBeenCalledWith('existing-job', undefined)
    expect(s.enqueue).not.toHaveBeenCalled()
  })

  it.each(['uploading', 'failed'])('permits explicit upload recovery after confirmed %s with an interrupted upload', async status => {
    const s = setup({ status }, 'upload_aborted_by_user: Upload cancelled')
    expect(await s.run()).toEqual({ ok: true })
    expect(s.enqueue).toHaveBeenCalledWith(expect.objectContaining({ recordingId: 'recording', requestKind: 'manual' }))
    expect(s.retry).not.toHaveBeenCalled()
  })

  it('does not reset an active local upload before its server job id is saved', async () => {
    const s = setup({ status: 'uploading' })
    s.recording.jobId = null
    s.recording.analysed = false
    s.recording.pipelineStatus = 'uploading'
    s.active.add('recording')
    expect(await s.run()).toMatchObject({ code: 'upload_already_in_progress' })
    expect(s.enqueue).not.toHaveBeenCalled()
    expect(s.poll).not.toHaveBeenCalled()
    expect(s.store.clearAnalysisFailure).not.toHaveBeenCalled()
    expect(s.recording.pipelineStatus).toBe('uploading')
  })

  it('allows another recording to enqueue while a different recording is uploading', async () => {
    const s = setup({ status: 'uploading' })
    s.recording.jobId = null
    s.recording.analysed = false
    s.active.add('another-recording')
    expect(await s.run()).toEqual({ ok: true })
    expect(s.enqueue).toHaveBeenCalledWith(expect.objectContaining({ recordingId: 'recording', requestKind: 'manual' }))
    expect(s.poll).not.toHaveBeenCalled()
  })

  it('does not apply an older server reply after the recording links to another job', async () => {
    const s = setup({ status: 'failed' }, 'Previous failure')
    s.poll.mockImplementation(async () => { s.recording.jobId = 'newer-job'; return { status: 'failed' } })
    expect(await s.run()).toMatchObject({ code: 'recording_changed' })
    expect(s.retry).not.toHaveBeenCalled()
    expect(s.enqueue).not.toHaveBeenCalled()
    expect(s.store.clearAnalysisFailure).not.toHaveBeenCalled()
  })

  it('does not act on a saved-job reply from a previous account', async () => {
    const s = setup({ status: 'processing' }, 'Previous failure')
    s.poll.mockImplementation(async () => { s.owner(8); return { status: 'processing' } })
    expect(await s.run()).toMatchObject({ code: 'session_changed' })
    expect(s.resume).not.toHaveBeenCalled()
    expect(s.enqueue).not.toHaveBeenCalled()
    expect(s.store.clearAnalysisFailure).not.toHaveBeenCalled()
  })
})

describe('duplicate upload failure callers', () => {
  it.each(['sendUploadFailure', 'dispatchAnalysisFailure'])('%s leaves the active recording and progress UI healthy', name => {
    const recording = { pipelineStatus: 'uploading', lastAnalysisError: null as string | null }
    const fail = vi.fn((_id: string, message: string) => { recording.pipelineStatus = 'failed'; recording.lastAnalysisError = message })
    const emit = vi.fn()
    const track = vi.fn()
    const context = vm.createContext({
      classifyActivationError, classifyAnalysisFailure, buildAnalysisErrorPayload,
      recordingsStore: { getById: () => recording, setAnalysisFailure: fail },
      postGameWindow: null, mainWindow: { webContents: { send: emit } },
      notifyRecordingsUpdated: vi.fn(), shouldReportAnalysisPipelineError: () => false,
      sendPostGameEventForRecording: emit, getActiveUserId: () => 7,
      trackUploadFailed: track, isLikelyNetworkFailure: () => false,
    })
    context.mainProcess = context
  vm.runInContext(failureCode, context)
    const caller = vm.runInContext(name, context) as (raw: string, opts: object) => AnalysisErrorPayload
    const payload = caller('upload_already_in_progress: This recording is already uploading', { recordingId: 'recording', notify: false, game: 'valorant' })
    expect(payload).toMatchObject({ kind: 'upload', canRetry: false, creditRefunded: false, failureCode: 'upload_already_in_progress' })
    expect(payload.hint).not.toMatch(/try again|retry/i)
    expect(fail).not.toHaveBeenCalled()
    expect(emit).not.toHaveBeenCalled()
    expect(track).not.toHaveBeenCalled()
    expect(recording).toEqual({ pipelineStatus: 'uploading', lastAnalysisError: null })
  })
})
