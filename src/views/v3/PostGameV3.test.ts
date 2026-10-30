import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { compileScript, parse } from '@vue/compiler-sfc'
import ts from 'typescript'
import * as vue from 'vue'
import { describe, expect, it } from 'vitest'
import * as helpers from '../../components/v3/postgame/post-game-v3'

const Stub = { name: 'Stub' }

function render(props: Record<string, unknown>): string {
  const { descriptor } = parse(readFileSync(new URL('./PostGameV3.vue', import.meta.url), 'utf8'))
  const script = compileScript(descriptor, { id: 'pg3-test', inlineTemplate: true })
  const code = ts.transpileModule(script.content, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports: any = {}
  vm.runInNewContext(code, {
    exports,
    require: (id: string) => {
      if (id === 'vue') return vue
      if (id.endsWith('/post-game-v3')) return helpers
      if (id.endsWith('.vue')) return Stub
      throw new Error(`Unexpected import: ${id}`)
    },
  })
  const base = {
    ready: false, tone: 'active', eyebrow: 'Post-match processing', title: 'Uploading your match', body: 'Sending securely.',
    progress: 40, status: 'Uploading', timing: '~1m remaining', primaryLabel: 'Open UpForge', showExpectations: true,
  }
  const r = exports.default.setup(vue.reactive({ ...base, ...props }), { expose() {}, emit() {} })
  return text(r({}, []))
}

function text(node: any): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(text).join(' ')
  const c = node.children
  if (c && typeof c === 'object' && !Array.isArray(c) && typeof c.default === 'function') return text(c.default())
  return text(c)
}

describe('PostGameV3', () => {
  it('ready: shows the real result, score, meta, coach line and evidence', () => {
    const out = render({
      ready: true, tone: 'success', primaryLabel: 'Review coaching', secondaryLabel: 'Web report', score: 'Coaching score 720 / 1000 · B',
      summary: { result: 'win', ally: 13, enemy: 11, kills: 18, deaths: 14, assists: 6 },
      matchName: 'Jett', mapName: 'Bind', coachLine: 'Positioning during post-plant', clipCount: 3, showFeedback: true,
    })
    expect(out).toContain('VICTORY')
    expect(out).toContain('13–11')
    expect(out).toContain('Jett · Bind · 18/14/6 K/D/A')
    expect(out).toContain('Positioning during post-plant')
    expect(out).toContain('3 clips from your recording · Coaching score 720 / 1000 · B')
    expect(out).toContain('Review coaching')
    expect(out).toContain('Was this coaching useful?')
    expect(out).not.toContain('Analysis usually takes')
  })

  it('ready without match data: no invented result or score', () => {
    const out = render({ ready: true, tone: 'success', summary: null, coachLine: null, body: 'Your match is ready to review.', clipCount: 0 })
    expect(out).not.toContain('VICTORY')
    expect(out).not.toContain('DEFEAT')
    expect(out).toContain('Your match is ready to review.')
    expect(out).not.toContain('clips from your recording')
  })

  it('in progress: status, progress and expectations, no feedback', () => {
    const out = render({})
    expect(out).toContain('Post-match processing')
    expect(out).toContain('Uploading your match')
    expect(out).toContain('40%')
    expect(out).toContain('~1m remaining')
    expect(out).toContain('Analysis usually takes')
    expect(out).not.toContain('Was this coaching useful?')
  })
})
