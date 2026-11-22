import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'

const source = readFileSync(new URL('./gaming-ipc.ts', import.meta.url), 'utf8')
const ast = ts.createSourceFile('gaming-ipc.ts', source, ts.ScriptTarget.Latest, true)
let registration = ''
function find(node: ts.Node) {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'ipcMain.handle'
    && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === 'trainer:get-drill-moments') registration = node.getText(ast)
  ts.forEachChild(node, find)
}
find(ast)
if (!registration) throw new Error('Drill moments IPC handler missing')
const code = ts.transpileModule(registration, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText

function setup() {
  let token: string | null = 'owner-a'
  const get = vi.fn(async () => ({ data: { drill_id: 7, matches: [] } }))
  let handler!: (_event: unknown, id: unknown) => Promise<unknown>
  vm.runInNewContext(code, {
    ipcMain: { handle: (_channel: string, fn: typeof handler) => { handler = fn } },
    auth: { getToken: () => token, getApi: () => ({ get }) },
    drillReadConfig: () => ({ timeout: 15000 }),
  })
  return { get, call: (id: unknown) => handler({}, id), setToken: (next: string | null) => { token = next } }
}

describe('owner-scoped drill source IPC', () => {
  it('calls the read endpoint only with an authenticated positive numeric drill ID', async () => {
    const s = setup()
    for (const id of [null, undefined, 0, -1, 1.5, Infinity, '7', '../7']) expect(await s.call(id)).toBeNull()
    expect(s.get).not.toHaveBeenCalled()
    expect(await s.call(7)).toEqual({ drill_id: 7, matches: [] })
    expect(s.get).toHaveBeenCalledExactlyOnceWith('/api/drills/7/moments', { timeout: 15000 })
    s.setToken(null)
    expect(await s.call(7)).toBeNull()
    expect(s.get).toHaveBeenCalledTimes(1)
  })

  it('drops a response for the previous account and treats API errors as unavailable', async () => {
    const s = setup()
    s.get.mockImplementationOnce(async () => { s.setToken('owner-b'); return { data: { drill_id: 7, matches: [] } } })
    expect(await s.call(7)).toBeNull()
    s.get.mockRejectedValueOnce(new Error('404'))
    expect(await s.call(7)).toBeNull()
  })
})
