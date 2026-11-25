import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { expect, it, vi } from 'vitest'
const source = readFileSync(new URL('./useVodReview.ts', import.meta.url), 'utf8')
const ast = ts.createSourceFile('review.ts', source, ts.ScriptTarget.Latest, true)
let fn!: ts.FunctionDeclaration
function visit(n: ts.Node) { if (ts.isFunctionDeclaration(n) && n.name?.text === 'onVideoError') fn = n; ts.forEachChild(n, visit) }
visit(ast)
const code = ts.transpileModule(fn.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
it('a failed identity-bound video never retries a generic URL or starts autoplay', () => {
  const cancel = vi.fn(), load = vi.fn(), refreshPlaybackUrl = vi.fn(), play = vi.fn()
  const context: any = { route: { query: { drillId: '7' } }, drillMomentSeek: { cancel, load }, playbackError: { value: null }, canRefreshCloudPlayback: { value: true }, refreshPlaybackUrl, videoEl: { value: { play } } }
  vm.createContext(context); vm.runInContext(code, context); context.onVideoError()
  expect(cancel).toHaveBeenCalledOnce(); expect(load).not.toHaveBeenCalled(); expect(refreshPlaybackUrl).not.toHaveBeenCalled(); expect(play).not.toHaveBeenCalled()
  expect(context.playbackError.value).toContain('Retry')
})
