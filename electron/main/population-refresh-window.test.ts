import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { expect, it, vi } from 'vitest'

const source = fs.readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
const start = source.indexOf('function schedulePopulationRefresh(')
const end = source.indexOf('\nfunction mergeSpatialSummary(', start)
const code = ts.transpileModule(source.slice(start, end), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText

it.each(['mainWindow', 'postGameWindow'])('skips %s if it closes while population data is loading', (closedWindow) => {
  let onUpdated: (summary: unknown) => void = () => {}
  const makeWindow = () => ({
    isDestroyed: vi.fn(() => false),
    webContents: { send: vi.fn() },
  })
  const mainWindow = makeWindow()
  const postGameWindow = makeWindow()
  const context = vm.createContext({
    mainWindow,
    postGameWindow,
    authManager: { getToken: () => 'test-token', getApi: () => ({}) },
    refreshMatchPopulationBenchmarks: (_match: unknown, _api: unknown, callback: typeof onUpdated) => {
      onUpdated = callback
      return Promise.resolve()
    },
  })
  vm.runInContext(code, context)
  context.schedulePopulationRefresh({ spatialSummary: { events: [{}] } })
  const closed = closedWindow === 'mainWindow' ? mainWindow : postGameWindow
  const open = closedWindow === 'mainWindow' ? postGameWindow : mainWindow
  closed.isDestroyed.mockReturnValue(true)
  closed.webContents.send.mockImplementation(() => { throw new TypeError('Object has been destroyed') })

  const summary = { events: [] }
  expect(() => onUpdated(summary)).not.toThrow()
  expect(closed.webContents.send).not.toHaveBeenCalled()
  expect(open.webContents.send).toHaveBeenCalledExactlyOnceWith('spatial:population-updated', summary)
})
