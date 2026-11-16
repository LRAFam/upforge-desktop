import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import pkg from '../../package.json'

const mocks = vi.hoisted(() => ({ spawn: vi.fn() }))
vi.mock('child_process', () => ({ spawn: mocks.spawn }))
vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }))
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: false } }))
vi.mock('electron-log', () => ({ default: { warn: vi.fn(), info: vi.fn() } }))
vi.mock('./background-work', () => ({ backgroundWork: { run: (fn: (signal: AbortSignal) => Promise<void>) => fn(new AbortController().signal) } }))

let install = ''
afterEach(() => {
  vi.unstubAllGlobals()
  if (install) fs.rmSync(install, { recursive: true, force: true })
})

it('extracts with the packaged Windows resource even when ffmpeg is absent from PATH', async () => {
  install = fs.mkdtempSync(path.join(os.tmpdir(), 'UpForge install '))
  const resource = pkg.build.extraResources.find(entry => entry.from === 'resources/ffmpeg')!
  const bundled = path.join(install, resource.to, 'ffmpeg.exe')
  fs.mkdirSync(path.dirname(bundled), { recursive: true })
  fs.writeFileSync(bundled, 'mock packaged executable')
  vi.stubGlobal('process', { ...process, platform: 'win32', resourcesPath: install, env: { ...process.env, PATH: '' } })
  mocks.spawn.mockImplementation((binary: string) => {
    const child = Object.assign(new EventEmitter(), { stderr: new EventEmitter(), kill: vi.fn() })
    queueMicrotask(() => {
      if (binary !== bundled || !fs.existsSync(binary)) child.emit('error', new Error('spawn ffmpeg.exe ENOENT'))
      else child.emit('close', 0)
    })
    return child
  })
  const { ClipExtractor } = await import('./clip-extractor')
  await new ClipExtractor().extract({ sourcePath: path.join(install, 'source.mp4'), outputPath: path.join(install, 'clip.mp4'), startOffsetMs: 1_000, durationMs: 5_000 })
  expect(mocks.spawn).toHaveBeenCalledOnce()
  expect(mocks.spawn.mock.calls[0]![0]).toBe(bundled)
  expect(mocks.spawn.mock.calls[0]![2]).toMatchObject({ windowsHide: true })
})
