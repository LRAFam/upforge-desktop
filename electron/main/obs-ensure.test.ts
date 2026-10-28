import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('electron-log', () => ({ default: { warn: vi.fn() } }))

vi.mock('./obs-process', () => ({
  isObsProcessRunning: vi.fn(),
  terminateObsProcess: vi.fn(),
  obsProcessSleep: vi.fn(async () => undefined),
}))

vi.mock('./obs-launcher', () => ({
  launchObsStudio: vi.fn(),
  restartObsStudioElevated: vi.fn(),
  obsLaunchDelayMs: () => 0,
}))

vi.mock('./obs-health', () => ({
  broadcastObsConnection: vi.fn(),
}))

vi.mock('./obs-connect', async (original) => ({
  ...await original<typeof import('./obs-connect')>(),
  explainObsConnectionFailure: vi.fn(({ processRunning, connectError }: { processRunning: boolean; connectError?: string }) =>
    processRunning ? `hung:${connectError ?? ''}` : 'not-running'),
}))

import { ensureObsConnected, obsPostLaunchConnectDelaysMs, resetObsLaunchCooldownForTests } from './obs-ensure'
import { isObsProcessRunning, terminateObsProcess } from './obs-process'
import { launchObsStudio, restartObsStudioElevated } from './obs-launcher'

function mockRecorder(overrides: {
  isConnected?: boolean
  connectResults?: Array<{ ok: true } | { ok: false; error: string }>
} = {}) {
  let connected = overrides.isConnected ?? false
  const results = [...(overrides.connectResults ?? [{ ok: true as const }])]
  return {
    isConnected: () => connected,
    isRecording: vi.fn(() => false),
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
    vi.mocked(restartObsStudioElevated).mockReset()
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

  it.each([0, 1])('leaves a responding OBS alone when authentication fails after %s retries', async (retries) => {
    vi.mocked(isObsProcessRunning).mockResolvedValue(true)
    vi.mocked(terminateObsProcess).mockResolvedValue({ ok: true })
    vi.mocked(launchObsStudio).mockResolvedValue({ ok: true })
    const error = 'WebSocket password incorrect — copy it from OBS'
    const rec = mockRecorder({
      connectResults: [
        ...Array.from({ length: retries }, () => fail()),
        ...Array.from({ length: 5 - retries }, () => fail(error)),
        { ok: true },
      ],
    })

    const result = await ensureObsConnected(rec as never, { password: 'wrong', port: 4455 })

    expect(result).toMatchObject({ ok: false, processRunning: true })
    expect(terminateObsProcess).not.toHaveBeenCalled()
    expect(restartObsStudioElevated).not.toHaveBeenCalled()
    expect(launchObsStudio).not.toHaveBeenCalled()
    expect(rec.connect).toHaveBeenCalledTimes(retries + 1)
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

  it('requests elevation and reconnects when Windows blocks the normal shutdown', async () => {
    vi.mocked(isObsProcessRunning).mockResolvedValue(true)
    vi.mocked(terminateObsProcess).mockResolvedValue({
      ok: false,
      requiresElevation: true,
      error: 'Administrator permission is required to restart OBS.',
    })
    vi.mocked(restartObsStudioElevated).mockResolvedValue({ ok: true })

    const rec = mockRecorder({
      connectResults: [
        fail(),
        fail(), fail(), fail(), fail(), // patient retries
        { ok: true }, // after elevated relaunch
      ],
    })

    const result = await ensureObsConnected(rec as never, { password: 'upforge', port: 4455 })

    expect(restartObsStudioElevated).toHaveBeenCalledWith({ password: 'upforge', port: 4455 })
    expect(launchObsStudio).not.toHaveBeenCalled()
    expect(result).toMatchObject({ ok: true, launched: true, processRunning: true })
  })

  it('does not kill during launch cooldown when WebSocket is still down', async () => {
    vi.mocked(isObsProcessRunning).mockResolvedValueOnce(false).mockResolvedValue(true)
    vi.mocked(launchObsStudio).mockResolvedValue({ ok: true })

    // First call: launch OBS but never connect
    const first = mockRecorder({
      connectResults: [
        fail(), fail(), fail(), fail(), fail(), fail(), fail(),
      ],
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

  it('uses a longer post-launch connect schedule', () => {
    expect(obsPostLaunchConnectDelaysMs(8000).length).toBeGreaterThanOrEqual(6)
    expect(obsPostLaunchConnectDelaysMs(8000)[0]).toBe(8000)
  })

  it('shares simultaneous startup and recovery requests instead of launching twice', async () => {
    vi.mocked(isObsProcessRunning).mockResolvedValue(false)
    vi.mocked(launchObsStudio).mockResolvedValue({ ok: true })
    const rec = mockRecorder()
    const opts = { password: 'upforge', port: 4455 }
    const results = await Promise.all([
      ensureObsConnected(rec as never, opts),
      ensureObsConnected(rec as never, opts),
    ])
    expect(results.every(result => result.ok)).toBe(true)
    expect(launchObsStudio).toHaveBeenCalledTimes(1)
    expect(rec.connect).toHaveBeenCalledTimes(1)
  })

  it('does not let concurrent recovery override a caller that forbids restart', async () => {
    vi.mocked(isObsProcessRunning).mockResolvedValue(true)
    vi.mocked(terminateObsProcess).mockResolvedValue({ ok: true })
    vi.mocked(launchObsStudio).mockResolvedValue({ ok: true })
    const rec = mockRecorder()
    rec.connect.mockResolvedValue(fail())
    const opts = { password: 'upforge', port: 4455 }
    await Promise.all([
      ensureObsConnected(rec as never, { ...opts, allowProcessRestart: true }),
      ensureObsConnected(rec as never, { ...opts, allowProcessRestart: false }),
    ])
    expect(terminateObsProcess).not.toHaveBeenCalled()
    expect(launchObsStudio).not.toHaveBeenCalled()
  })

  it('rechecks recording ownership after connection retries before restarting', async () => {
    vi.mocked(isObsProcessRunning).mockResolvedValue(true)
    vi.mocked(terminateObsProcess).mockResolvedValue({ ok: true })
    vi.mocked(launchObsStudio).mockResolvedValue({ ok: true })
    const rec = mockRecorder()
    rec.connect.mockImplementation(async () => {
      rec.isRecording.mockReturnValue(true)
      return fail()
    })
    await ensureObsConnected(rec as never, { password: 'upforge', port: 4455 })
    expect(terminateObsProcess).not.toHaveBeenCalled()
  })

  it('rechecks the caller policy after retries, including a newly active match', async () => {
    vi.mocked(isObsProcessRunning).mockResolvedValue(true)
    vi.mocked(terminateObsProcess).mockResolvedValue({ ok: true })
    vi.mocked(launchObsStudio).mockResolvedValue({ ok: true })
    let mayRestart = true
    const rec = mockRecorder()
    rec.connect.mockImplementation(async () => {
      mayRestart = false
      return fail()
    })
    await ensureObsConnected(rec as never, {
      password: 'upforge', port: 4455, canRestartProcess: () => mayRestart,
    })
    expect(terminateObsProcess).not.toHaveBeenCalled()
  })

  it('releases a failed startup so a deliberate retry can launch again', async () => {
    vi.mocked(isObsProcessRunning).mockResolvedValue(false)
    vi.mocked(launchObsStudio)
      .mockResolvedValueOnce({ ok: false, error: 'Launch blocked' })
      .mockResolvedValueOnce({ ok: true })
    const rec = mockRecorder()
    const opts = { password: 'upforge', port: 4455 }
    expect(await ensureObsConnected(rec as never, opts)).toMatchObject({ ok: false })
    expect(await ensureObsConnected(rec as never, opts)).toMatchObject({ ok: true })
    expect(launchObsStudio).toHaveBeenCalledTimes(2)
  })
})
