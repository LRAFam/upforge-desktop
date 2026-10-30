import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { compileScript, parse } from '@vue/compiler-sfc'
import ts from 'typescript'
import * as vue from 'vue'
import { describe, expect, it } from 'vitest'
import { renderToString } from 'vue/server-renderer'
import * as coachingBrief from '../../../lib/coaching-brief'

// Shared match-page panels carry an in-file v3 branch next to the old markup.
// Compile each SFC by hand (no Vite Vue plugin in vitest) with the uiV3 switch stubbed, and
// check that both branches render the same real data.
function load(file: string, uiV3: boolean) {
  const { descriptor } = parse(readFileSync(new URL(file, import.meta.url), 'utf8'))
  const script = compileScript(descriptor, { id: `vod-v3-${uiV3}`, inlineTemplate: true })
  const code = ts.transpileModule(script.content, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports: any = {}
  const modules: Record<string, unknown> = {
    vue,
    '../lib/ui-v3': { uiV3: vue.ref(uiV3) },
    '../lib/coaching-brief': coachingBrief,
  }
  vm.runInNewContext(code, { exports, require: (id: string) => { if (id in modules) return modules[id]; throw new Error(`Unexpected import: ${id}`) } })
  return exports.default
}
const render = (component: unknown, props: Record<string, unknown>) =>
  renderToString(vue.createSSRApp({ render: () => vue.h(component as any, props) }))

const timing = [
  { id: 't1', type: 'rotate', round: 4, label: 'Rotate to B', player_label: '0:21', reference_label: '0:14', reference_scope: 'Gold avg', difference_seconds: 7, result: 'Later than most players at your rank.', video_offset_ms: 90000 },
  { id: 't2', type: 'plant', round: null, label: 'Plant', player_label: '0:40', reference_label: '0:44', reference_scope: 'Gold avg', difference_seconds: -4, result: 'Faster plant.', video_offset_ms: null },
]

describe('TimingComparisonPanel v3 branch', () => {
  it('renders hairline rows with the real labels and signed differences', async () => {
    const html = await render(load('../../TimingComparisonPanel.vue', true), { comparisons: timing })
    expect(html).toContain('class="tc3"')
    expect(html).toContain('Rotate to B')
    expect(html).toContain('+7s')
    expect(html).toContain('-4s')
    expect(html).toContain('var(--uf-loss)')
    expect(html).toContain('var(--uf-win)')
    expect(html).not.toContain('rounded-xl')
  })

  it('keeps the old markup when v3 is off', async () => {
    const html = await render(load('../../TimingComparisonPanel.vue', false), { comparisons: timing })
    expect(html).toContain('rounded-xl')
    expect(html).not.toContain('class="tc3"')
    expect(html).toContain('Rotate to B')
  })

  it('renders nothing without comparisons in either mode', async () => {
    for (const on of [true, false]) {
      const html = await render(load('../../TimingComparisonPanel.vue', on), { comparisons: [] })
      expect(html).not.toContain('Rotate')
      expect(html).not.toContain('<section')
    }
  })
})

describe('TacticalIntelBrief v3 branch', () => {
  const value = {
    severity: 'high',
    headline: 'You died first in 6 of 13 rounds.',
    fix: 'Hold the first angle for two seconds before peeking.',
    evidence: [{ roundLabel: 'R4', timeLabel: '0:21', timeSeconds: 21, text: 'Dry peek on A main' }],
    improvements: [],
    tags: ['first_death'],
    source: 'coaching',
  }

  it('shows the coach sentence, evidence stamps and the next step without boxes', async () => {
    const html = await render(load('../../TacticalIntelBrief.vue', true), { brief: value })
    expect(html).toContain('tb3-says')
    expect(html).toContain('You died first in 6 of 13 rounds.')
    expect(html).toContain('R4 · 0:21')
    expect(html).toContain('Flag this moment')
    expect(html).toContain('Next step')
    expect(html).toContain('first death')
    expect(html).not.toContain('rounded-xl')
  })

  it('keeps the old markup when v3 is off', async () => {
    const html = await render(load('../../TacticalIntelBrief.vue', false), { brief: value })
    expect(html).toContain('rounded-xl')
    expect(html).not.toContain('tb3-says')
    expect(html).toContain('You died first in 6 of 13 rounds.')
  })
})
