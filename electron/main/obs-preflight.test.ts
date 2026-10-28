import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildPreflightFailure,
  runObsPreflight,
  runObsTestRecording,
} from './obs-preflight'

vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn() } }))

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
  it('leaves an existing recording alone', async () => {
    const obs = mockObsClient({ recordActive: true })
    const result = await runObsTestRecording({ obs: obs as never })
    expect(result.ok).toBe(false)
    expect(obs.call).not.toHaveBeenCalledWith('StartRecord')
    expect(obs.call).not.toHaveBeenCalledWith('StopRecord')
  })

  it('does not stop another recording when OBS explicitly rejects our start request', async () => {
    const obs = { call: vi.fn(async (method: string) => {
      if (method === 'GetRecordStatus') return { outputActive: false }
      if (method === 'StartRecord') throw new Error('Output is already running')
      return {}
    }) }
    const result = await runObsTestRecording({ obs: obs as never })
    expect(result.ok).toBe(false)
    expect(obs.call).not.toHaveBeenCalledWith('StopRecord')
  })

  it('does not start when the output state is missing', async () => {
    const obs = { call: vi.fn(async () => ({})) }
    const result = await runObsTestRecording({ obs: obs as never })
    expect(result.ok).toBe(false)
    expect(result.technicalMessage).toContain('missing outputActive')
    expect(obs.call).toHaveBeenCalledTimes(1)
  })

  it('bounds a lost StartRecord reply and confirms cleanup before returning', async () => {
    vi.useFakeTimers()
    try {
      let active = false
      const obs = { call: vi.fn(async (method: string) => {
        if (method === 'StartRecord') {
          active = true
          return new Promise<never>(() => {})
        }
        if (method === 'StopRecord') active = false
        return { outputActive: active }
      }) }
      const pending = runObsTestRecording({ obs: obs as never })
      await vi.advanceTimersByTimeAsync(5000)
      expect(await pending).toMatchObject({ ok: false, technicalMessage: 'OBS StartRecord timed out' })
      expect(active).toBe(false)
      expect(obs.call).toHaveBeenCalledWith('StopRecord')
    } finally { vi.useRealTimers() }
  })

  it('reports failed cleanup alongside the original verification error', async () => {
    vi.useFakeTimers()
    try {
      let reads = 0
      const obs = { call: vi.fn(async (method: string) => {
        if (method === 'GetRecordStatus') {
          reads++
          if (reads === 2) throw new Error('Verification failed')
          return { outputActive: reads > 1 }
        }
        return {}
      }) }
      const pending = runObsTestRecording({ obs: obs as never })
      await vi.advanceTimersByTimeAsync(15_000)
      const result = await pending
      expect(result.ok).toBe(false)
      expect(result.technicalMessage).toContain('Verification failed')
      expect(result.technicalMessage).toContain('cleanup failed: OBS did not stop recording')
    } finally { vi.useRealTimers() }
  })

  it('cleans up its recording when verification fails after StartRecord succeeds', async () => {
    let active = false
    let reads = 0
    const obs = { call: vi.fn(async (method: string) => {
      if (method === 'GetRecordStatus') {
        if (++reads === 2) throw new Error('OBS status request failed')
        return { outputActive: active }
      }
      if (method === 'StartRecord') active = true
      if (method === 'StopRecord') active = false
      return {}
    }) }
    const result = await runObsTestRecording({ obs: obs as never })
    expect(result.ok).toBe(false)
    expect(result.technicalMessage).toContain('OBS status request failed')
    expect(active).toBe(false)
    expect(obs.call).toHaveBeenCalledWith('StopRecord')
  })

  it('shares overlapping test recordings so the second caller cannot stop the first', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'obs-test-shared-'))
    try {
      const outputPath = join(dir, 'test.mkv')
      writeFileSync(outputPath, 'recorded video')
      const obs = mockObsClient({ outputPath })
      const opts = { obs: obs as never, sleep: async () => {} }
      const results = await Promise.all([runObsTestRecording(opts), runObsTestRecording(opts)])
      expect(results.every(result => result.ok)).toBe(true)
      expect(obs.call.mock.calls.filter(([method]) => method === 'StartRecord')).toHaveLength(1)
      expect(obs.call.mock.calls.filter(([method]) => method === 'StopRecord')).toHaveLength(1)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it.each([true, false])('requires confirmed stopped output before accepting the file (stuck=%s)', async (stuck) => {
    vi.useFakeTimers()
    const dir = mkdtempSync(join(tmpdir(), 'obs-test-stop-'))
    try {
      const outputPath = join(dir, 'test.mkv')
      writeFileSync(outputPath, 'recorded video')
      let active = false
      const obs = { call: vi.fn(async (method: string) => {
        if (method === 'StartRecord') active = true
        if (method === 'StopRecord' && !stuck) active = false
        return { outputActive: active, outputPath }
      }) }
      const pending = runObsTestRecording({ obs: obs as never, recordDurationMs: 1 })
      await vi.advanceTimersByTimeAsync(20_000)
      const result = await pending
      expect(result.ok).toBe(!stuck)
      if (stuck) expect(result.technicalMessage).toContain('did not stop recording')
    } finally {
      vi.useRealTimers()
      rmSync(dir, { recursive: true, force: true })
    }
  })

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
