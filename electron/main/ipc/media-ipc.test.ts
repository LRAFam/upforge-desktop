import type { IpcMain } from 'electron'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: {}, desktopCapturer: {}, BrowserWindow: { getAllWindows: () => [] } }))
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('../obs-health', () => ({}))
vi.mock('../obs-ensure', () => ({}))
vi.mock('../obs-guided-setup', () => ({ createGuidedObsSetupRunner: () => vi.fn(), readGuidedObsOutputs: vi.fn(), runGuidedObsSetup: vi.fn() }))
vi.mock('../obs-process', () => ({}))
vi.mock('../obs-connect', () => ({}))
vi.mock('../obs-installer', () => ({}))
vi.mock('../obs-launcher', () => ({}))
vi.mock('../obs-profile-installer', () => ({}))
vi.mock('../obs-preflight', () => ({}))
vi.mock('../obs-start-verify', () => ({}))
vi.mock('../funnel-events', () => ({}))
vi.mock('../obs-recorder', () => ({ OBSRecorder: class {} }))
vi.mock('../settings-manager', () => ({ SettingsManager: class {} }))
vi.mock('./api-helpers', () => ({ setPendingCaptureSource: vi.fn() }))
vi.mock('../recording-errors', () => ({ reportRecordingError: vi.fn() }))

import { setupMediaHandlers } from './media-ipc'

function stopHandler(ownerGame: string | null) {
  const handlers = new Map<string, () => Promise<unknown>>()
  const recorder = { isRecording: () => true, stop: vi.fn(async () => {}) }
  const endMatch = vi.fn(async (_game: string) => ({ ok: true }))
  const settings = { get: () => ({ primaryGame: 'valorant' }) }
  setupMediaHandlers(
    { handle: (key: string, fn: () => Promise<unknown>) => handlers.set(key, fn) } as unknown as IpcMain,
    () => recorder as never,
    settings as never,
    undefined,
    endMatch,
    () => ownerGame,
  )
  return { stop: handlers.get('recorder:stop')!, endMatch, recorder }
}

describe('recorder:stop attribution', () => {
  it('finishes the match as the game that owns the recording (CS2 with the Valorant tab selected)', async () => {
    const { stop, endMatch } = stopHandler('cs2')
    await stop()
    expect(endMatch).toHaveBeenCalledWith('cs2')
  })

  it('never invents Valorant when no game owns the recording — stops OBS only', async () => {
    const { stop, endMatch, recorder } = stopHandler(null)
    expect(await stop()).toEqual({ ok: true })
    expect(endMatch).not.toHaveBeenCalled()
    expect(recorder.stop).toHaveBeenCalled()
  })
})
