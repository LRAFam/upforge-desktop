import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Execute the registered handler itself, with external opening isolated from Electron.
const source = readFileSync(new URL('./gaming-ipc.ts', import.meta.url), 'utf8')
const ast = ts.createSourceFile('gaming-ipc.ts', source, ts.ScriptTarget.Latest, true)
let registration = ''
function findHandler(node: ts.Node): void {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'ipcMain.handle'
    && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === 'deadlock:open-results') {
    registration = node.getText(ast)
  }
  ts.forEachChild(node, findHandler)
}
findHandler(ast)
if (!registration) throw new Error('Deadlock results handler is missing')

const code = ts.transpileModule(registration, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText
const openExternalSafe = vi.fn(() => ({ ok: true }))
let handler: (_event: unknown, jobId: unknown) => { ok: boolean }
runInNewContext(code, {
  ipcMain: { handle: (_channel: string, callback: typeof handler) => { handler = callback } },
  getFrontendBaseUrl: () => 'https://upforge.gg',
  openExternalSafe,
})

describe('deadlock:open-results', () => {
  beforeEach(() => openExternalSafe.mockClear())

  it.each([undefined, null, false, 123, {}, [], '', '   ', 'undefined', 'null', '../other', 'job-12345?tab=bad'].map(jobId => [jobId]))
    ('rejects invalid ID %j without opening a URL', jobId => {
      expect(handler({}, jobId)).toEqual({ ok: false })
      expect(openExternalSafe).not.toHaveBeenCalled()
    })

  it.each(['567da247-3343-45ed-a0cc-4bf20919177e', 'job-12345'])
    ('opens the unchanged URL for valid ID %s', jobId => {
      expect(handler({}, jobId)).toEqual({ ok: true })
      expect(openExternalSafe).toHaveBeenCalledExactlyOnceWith(`https://upforge.gg/deadlock/results/${jobId}`)
    })
})
