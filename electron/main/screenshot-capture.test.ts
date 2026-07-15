import { describe, expect, it, vi } from 'vitest'

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
})
