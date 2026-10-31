import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { expect, it, vi } from 'vitest'

const source = fs.readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
const start = source.indexOf('async function maybeUploadDemoOnly(')
const end = source.indexOf('\n    const clipsOnly =', start)
const code = ts.transpileModule(source.slice(start, end), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText

it.each([false, true])('finishes a replay upload when the main window closes: %s', async (closed) => {
  let finishUpload!: () => void
  const upload = new Promise<void>(resolve => { finishUpload = resolve })
  let destroyed = false
  const send = vi.fn(() => {
    if (destroyed) throw new TypeError('Object has been destroyed')
  })
  const context = vm.createContext({
    autoAnalyse: true,
    game: 'cs2',
    usesDemoReplay: () => true,
    canUploadCapture: () => true,
    logActivity: vi.fn(),
    gameLabel: () => 'CS2',
    showAppNotification: vi.fn(),
    notifySilent: () => true,
    mainWindow: { isDestroyed: () => destroyed, webContents: { send } },
    tryAutoUploadSourceReplay: vi.fn(() => upload),
    pendingReplayPath: '/tmp/test.dem',
    matchSessionStart: 123,
    authManager: {},
    config: {},
  })
  vm.runInContext(code, context)
  const pending = context.maybeUploadDemoOnly('no VOD')
  expect(context.tryAutoUploadSourceReplay).toHaveBeenCalledOnce()
  destroyed = closed
  finishUpload()
  await expect(pending).resolves.toBeUndefined()
  if (closed) expect(send).not.toHaveBeenCalled()
  else expect(send).toHaveBeenCalledExactlyOnceWith('dashboard:refresh', { fresh: true })
})
