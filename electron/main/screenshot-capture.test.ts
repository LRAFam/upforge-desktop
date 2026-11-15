import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { getSources, writeFile } = vi.hoisted(() => ({
  getSources: vi.fn(async () => [{
    thumbnail: {
      toPNG: () => Buffer.from('png'),
      toDataURL: vi.fn(),
    },
  }]),
  writeFile: vi.fn(async () => {}),
}))

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/upforge' },
  desktopCapturer: { getSources },
  screen: {
    getPrimaryDisplay: () => ({
      size: { width: 1920, height: 1080 },
      scaleFactor: 1,
    }),
  },
}))

vi.mock('fs', () => ({
  default: {
    promises: {
      mkdir: vi.fn(async () => {}),
      writeFile,
    },
  },
}))

vi.mock('electron-log', () => ({
  default: { info: vi.fn(), warn: vi.fn() },
}))

import { captureAndSaveScreenshot } from './screenshot-capture'

beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.useRealTimers())

describe('captureAndSaveScreenshot', () => {
  it('captures at native display size and writes PNG asynchronously', async () => {
    const result = await captureAndSaveScreenshot()
    expect(result.ok).toBe(true)
    expect(getSources).toHaveBeenCalledWith({
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 },
    })
    expect(writeFile).toHaveBeenCalledWith(expect.any(String), Buffer.from('png'))
  })

  it('retries a failed enumeration once with fresh options and saves the screenshot', async () => {
    getSources.mockRejectedValueOnce(new Error('Failed to get sources.'))
    const result = await captureAndSaveScreenshot()
    expect(result.ok).toBe(true)
    expect(getSources).toHaveBeenCalledTimes(2)
    expect(getSources.mock.calls[1]).toEqual([{ types: ['screen'], thumbnailSize: { width: 1920, height: 1079 } }])
    expect(writeFile).toHaveBeenCalledOnce()
  })

  it('returns a recoverable failure when both attempts fail, then the next capture works', async () => {
    getSources.mockRejectedValueOnce(new Error('Failed to get sources.')).mockRejectedValueOnce(new Error('Failed to get sources.'))
    await expect(captureAndSaveScreenshot()).resolves.toEqual({ ok: false, error: 'Error: Failed to get sources.' })
    expect(writeFile).not.toHaveBeenCalled()
    await expect(captureAndSaveScreenshot()).resolves.toMatchObject({ ok: true })
  })

  it('returns no_sources when the system exposes no screens', async () => {
    getSources.mockResolvedValueOnce([])
    await expect(captureAndSaveScreenshot()).resolves.toEqual({ ok: false, error: 'no_sources' })
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('times out a getSources call that never settles instead of hanging the hotkey', async () => {
    vi.useFakeTimers()
    getSources.mockImplementationOnce(() => new Promise(() => {})).mockImplementationOnce(() => new Promise(() => {}))
    const pending = captureAndSaveScreenshot()
    await vi.advanceTimersByTimeAsync(20_000)
    await expect(pending).resolves.toEqual({ ok: false, error: 'Error: Screen capture timed out' })
  })
})
