import { describe, expect, it, vi } from 'vitest'
import {
  buildPreflightFailure,
  runObsPreflight,
  runObsTestRecording,
} from './obs-preflight'

vi.mock('./obs-installer', () => ({
  isObsInstalled: vi.fn(() => true),
}))

vi.mock('./obs-ensure', () => ({
  ensureObsConnected: vi.fn(async () => ({ ok: true, processRunning: true })),
}))

function mockObsClient(overrides: {
  scenes?: string[]
  captureKind?: string
  captureEnabled?: boolean
  recordActive?: boolean
  outputPath?: string
} = {}) {
  const scenes = overrides.scenes ?? ['UpForge']
  const captureKind = overrides.captureKind ?? 'window_capture'
  const captureEnabled = overrides.captureEnabled ?? true
  let recordActive = overrides.recordActive ?? false
  const outputPath = overrides.outputPath ?? '/tmp/upforge-test.mkv'

  return {
    call: vi.fn(async (method: string, args?: Record<string, unknown>) => {
      switch (method) {
        case 'GetSceneList':
          return { scenes: scenes.map((sceneName) => ({ sceneName })) }
        case 'GetSceneItemList':
          return {
            sceneItems: [
              { sourceName: 'UpForge Capture', sceneItemId: 1 },
            ],
          }
        case 'GetInputSettings':
          return { inputKind: captureKind }
        case 'GetSceneItemEnabled':
          return { sceneItemEnabled: captureEnabled }
        case 'GetRecordStatus':
          return { outputActive: recordActive, outputPath: recordActive ? outputPath : undefined }
        case 'StartRecord':
          recordActive = true
          return {}
        case 'StopRecord':
          recordActive = false
          return { outputPath }
        default:
          throw new Error(`unexpected call: ${method} ${JSON.stringify(args)}`)
      }
    }),
  }
}

function mockRecorder(obs: ReturnType<typeof mockObsClient>, connected = true) {
  return {
    isConnected: () => connected,
    connect: vi.fn(async () => ({ ok: true as const, version: '5.0.0' })),
    getObsClient: () => obs,
    setupScene: vi.fn(),
  }
}

describe('runObsPreflight', () => {
  it('passes when scene and source exist', async () => {
    const obs = mockObsClient()
    const result = await runObsPreflight({
      obsRecorder: mockRecorder(obs) as never,
      game: 'valorant',
      password: 'upforge',
      port: 4455,
      sleep: async () => {},
    })

    expect(result.ok).toBe(true)
    expect(result.passedAt).toBeTruthy()
    expect(result.steps.map((s) => s.step)).toEqual([
      'obs_installed',
      'obs_running',
      'websocket_auth',
      'scene_exists',
      'source_exists',
      'source_active',
    ])
  })

  it('fails when UpForge scene is missing', async () => {
    const obs = mockObsClient({ scenes: ['Main'] })
    const result = await runObsPreflight({
      obsRecorder: mockRecorder(obs) as never,
      game: 'valorant',
      password: 'upforge',
      port: 4455,
      sleep: async () => {},
    })

    expect(result.ok).toBe(false)
    expect(result.errorCode).toBe('obs_scene_missing')
    expect(result.userMessage).toMatch(/Repair Setup/)
  })

  it('fails when capture source type is invalid', async () => {
    const obs = mockObsClient({ captureKind: 'monitor_capture' })
    const result = await runObsPreflight({
      obsRecorder: mockRecorder(obs) as never,
      game: 'valorant',
      password: 'upforge',
      port: 4455,
      sleep: async () => {},
    })

    expect(result.ok).toBe(false)
    expect(result.errorCode).toBe('obs_invalid_source_type')
  })

  it('does not fail preflight when source is hidden (optional step)', async () => {
    const obs = mockObsClient({ captureEnabled: false })
    const result = await runObsPreflight({
      obsRecorder: mockRecorder(obs) as never,
      game: 'valorant',
      password: 'upforge',
      port: 4455,
      sleep: async () => {},
    })

    expect(result.ok).toBe(true)
    const activeStep = result.steps.find((s) => s.step === 'source_active')
    expect(activeStep?.ok).toBe(false)
    expect(activeStep?.optional).toBe(true)
  })
})

describe('runObsTestRecording', () => {
  it('times out when output never arms', async () => {
    const obs = mockObsClient()
    vi.mocked(obs.call).mockImplementation(async (method: string) => {
      if (method === 'GetRecordStatus') return { outputActive: false, outputPath: undefined }
      if (method === 'StartRecord') return {}
      if (method === 'StopRecord') return {}
      throw new Error(`unexpected: ${method}`)
    })

    let now = 0
    const result = await runObsTestRecording({
      obs: obs as never,
      recordVerifyMs: 100,
      sleep: async (ms) => { now += ms },
    })

    expect(result.ok).toBe(false)
    expect(result.errorCode).toBe('obs_recording_start_timeout')
  })
})

describe('buildPreflightFailure', () => {
  it('returns first blocking failure', () => {
    const failure = buildPreflightFailure([
      { step: 'obs_installed', ok: true },
      { step: 'scene_exists', ok: false, code: 'obs_scene_missing', userMessage: 'repair', technicalMessage: 'missing' },
      { step: 'source_active', ok: false, optional: true, code: 'obs_source_missing', userMessage: 'hidden', technicalMessage: 'hidden' },
    ])
    expect(failure.errorCode).toBe('obs_scene_missing')
  })
})
