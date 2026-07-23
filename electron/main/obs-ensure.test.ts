import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('./obs-process', () => ({
  isObsProcessRunning: vi.fn(),
  terminateObsProcess: vi.fn(),
  obsProcessSleep: vi.fn(async () => undefined),
}))

vi.mock('./obs-launcher', () => ({
  launchObsStudio: vi.fn(),
  obsLaunchDelayMs: () => 0,
}))

vi.mock('./obs-health', () => ({
  broadcastObsConnection: vi.fn(),
}))

vi.mock('./obs-connect', () => ({
  explainObsConnectionFailure: vi.fn(({ processRunning, connectError }: { processRunning: boolean; connectError?: string }) =>
    processRunning ? `hung:${connectError ?? ''}` : 'not-running'),
}))

import { ensureObsConnected, resetObsLaunchCooldownForTests } from './obs-ensure'
import { isObsProcessRunning, terminateObsProcess } from './obs-process'
import { launchObsStudio } from './obs-launcher'

function mockRecorder(overrides: {
  isConnected?: boolean
  connectResults?: Array<{ ok: true } | { ok: false; error: string }>
} = {}) {
  let connected = overrides.isConnected ?? false
  const results = [...(overrides.connectResults ?? [{ ok: true as const }])]
  return {
    isConnected: () => connected,
    connect: vi.fn(async () => {
      const next = results.shift() ?? { ok: true as const }
      if (next.ok) connected = true
      return next
    }),
    getOBSStatus: () => ({
      connected,
      recording: false,
      replayBufferActive: false,
      outputPath: null,
      lastError: null,
      obsVersion: null,
    }),
  }
}

const fail = (error = 'ECONNREFUSED'): { ok: false; error: string } => ({ ok: false, error })

describe('ensureObsConnected', () => {
  beforeEach(() => {
    resetObsLaunchCooldownForTests()
    vi.mocked(isObsProcessRunning).mockReset()
    vi.mocked(terminateObsProcess).mockReset()
    vi.mocked(launchObsStudio).mockReset()
  })

  it('returns alreadyConnected when WebSocket is up', async () => {
    const rec = mockRecorder({ isConnected: true })
    const result = await ensureObsConnected(rec as never, { password: 'upforge', port: 4455 })
    expect(result).toEqual({ ok: true, alreadyConnected: true, processRunning: true })
    expect(launchObsStudio).not.toHaveBeenCalled()
  })

  it('reconnects patiently when process is up before killing', async () => {
    vi.mocked(isObsProcessRunning).mockResolvedValue(true)
    const rec = mockRecorder({
      connectResults: [fail(), fail(), fail(), { ok: true }],
    })

    const result = await ensureObsConnected(rec as never, { password: 'upforge', port: 4455 })

    expect(terminateObsProcess).not.toHaveBeenCalled()
    expect(launchObsStudio).not.toHaveBeenCalled()
    expect(result.ok).toBe(true)
  })

  it('kills hung OBS then relaunches when process is up but WebSocket keeps failing', async () => {
    vi.mocked(isObsProcessRunning).mockResolvedValue(true)
    vi.mocked(terminateObsProcess).mockResolvedValue({ ok: true })
    vi.mocked(launchObsStudio).mockResolvedValue({ ok: true })

    const rec = mockRecorder({
      connectResults: [
        fail(),
        fail(), fail(), fail(), fail(), // patient retries
        { ok: true }, // after relaunch
      ],
    })

    const result = await ensureObsConnected(rec as never, { password: 'upforge', port: 4455 })

    expect(terminateObsProcess).toHaveBeenCalled()
    expect(launchObsStudio).toHaveBeenCalledWith({ password: 'upforge', port: 4455 })
    expect(result.ok).toBe(true)
  })

  it('does not kill during launch cooldown when WebSocket is still down', async () => {
    vi.mocked(isObsProcessRunning).mockResolvedValueOnce(false).mockResolvedValue(true)
    vi.mocked(launchObsStudio).mockResolvedValue({ ok: true })

    // First call: launch OBS but never connect
    const first = mockRecorder({
      connectResults: [fail(), fail(), fail(), fail(), fail()],
    })
    const firstResult = await ensureObsConnected(first as never, { password: 'upforge', port: 4455 })
    expect(firstResult.ok).toBe(false)
    expect(terminateObsProcess).not.toHaveBeenCalled()

    // Second call: process still up, WS still failing — cooldown blocks kill
    const second = mockRecorder({
      connectResults: [fail(), fail(), fail(), fail(), fail()],
    })
    const secondResult = await ensureObsConnected(second as never, { password: 'upforge', port: 4455 })

    expect(terminateObsProcess).not.toHaveBeenCalled()
    expect(secondResult.ok).toBe(false)
    expect(secondResult.processRunning).toBe(true)
  })

  it('does not kill hung process when allowProcessRestart is false', async () => {
    vi.mocked(isObsProcessRunning).mockResolvedValue(true)
    const rec = mockRecorder({
      connectResults: [fail(), fail(), fail(), fail(), fail()],
    })

    const result = await ensureObsConnected(rec as never, {
      password: 'upforge',
      port: 4455,
      allowProcessRestart: false,
    })

    expect(terminateObsProcess).not.toHaveBeenCalled()
    expect(launchObsStudio).not.toHaveBeenCalled()
    expect(result.ok).toBe(false)
  })

  it('launches OBS when no process is running', async () => {
    vi.mocked(isObsProcessRunning).mockResolvedValue(false)
    vi.mocked(launchObsStudio).mockResolvedValue({ ok: true })
    const rec = mockRecorder({ connectResults: [{ ok: true }] })

    const result = await ensureObsConnected(rec as never, { password: 'upforge', port: 4455 })

    expect(terminateObsProcess).not.toHaveBeenCalled()
    expect(launchObsStudio).toHaveBeenCalled()
    expect(result.ok).toBe(true)
  })
})
