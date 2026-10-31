import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { parse } from '@vue/compiler-sfc'
import ts from 'typescript'
import { expect, it, vi } from 'vitest'

function playerBinding() {
  const source = readFileSync(new URL('./VodReviewComparison.vue', import.meta.url), 'utf8')
  const { descriptor } = parse(source)
  const script = ts.createSourceFile('comparison.ts', descriptor.scriptSetup!.content, ts.ScriptTarget.Latest, true)
  const binding = script.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'setPlayer')!
  const code = ts.transpileModule(binding.getText(script), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText
  class Video {}
  const players = [null, null]
  const observer = { observe: vi.fn(), unobserve: vi.fn() }
  const context = vm.createContext({ HTMLVideoElement: Video, players, markerResize: observer })
  vm.runInContext(code, context)
  return { bind: context.setPlayer as (side: number, video: Video | null) => void, Video, observer, players }
}

it('keeps observing the same video across Vue function-ref updates without restarting notifications', () => {
  const { bind, Video, observer } = playerBinding()
  const video = new Video()
  bind(0, video)
  bind(0, video) // Marker width or playback time causes Vue to update the existing video ref.
  bind(0, video)
  expect(observer.observe).toHaveBeenCalledExactlyOnceWith(video)
  expect(observer.unobserve).not.toHaveBeenCalled()
})

it('moves observation to a replacement video and releases it on unmount', () => {
  const { bind, Video, observer, players } = playerBinding()
  const first = new Video()
  const replacement = new Video()
  bind(1, first)
  bind(1, replacement)
  expect(observer.unobserve).toHaveBeenCalledExactlyOnceWith(first)
  expect(observer.observe).toHaveBeenLastCalledWith(replacement)
  expect(players[1]).toBe(replacement)
  bind(1, null)
  bind(1, null)
  expect(observer.unobserve).toHaveBeenCalledTimes(2)
  expect(observer.unobserve).toHaveBeenLastCalledWith(replacement)
  expect(players[1]).toBeNull()
})
