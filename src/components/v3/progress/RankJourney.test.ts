import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { compileScript, parse } from '@vue/compiler-sfc'
import ts from 'typescript'
import * as vue from 'vue'
import { describe, expect, it } from 'vitest'
import { renderToString } from 'vue/server-renderer'
import * as chart from './progress-chart'
import * as valorant from '../../../lib/valorant'

// Compile the SFC by hand, as the other component tests in this repo do (no Vite Vue plugin in vitest).
function loadRankJourney() {
  const { descriptor } = parse(readFileSync(new URL('./RankJourney.vue', import.meta.url), 'utf8'))
  const script = compileScript(descriptor, { id: 'rank-journey-test', inlineTemplate: true })
  const code = ts.transpileModule(script.content, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports: any = {}
  vm.runInNewContext(code, {
    exports,
    require: (id: string) => {
      if (id === 'vue') return vue
      if (id.endsWith('/progress-chart')) return chart
      if (id.endsWith('/lib/valorant')) return valorant
      throw new Error(`Unexpected import: ${id}`)
    },
  })
  return exports.default
}
const RankJourney = loadRankJourney()

const history = [
  { date: '2026-10-01T12:00:00Z', rank: 'Silver 3', rr: 90, elo: 1190 },
  { date: '2026-10-08T12:00:00Z', rank: 'Gold 1', rr: 10, elo: 1210 },
  { date: '2026-10-20T12:00:00Z', rank: 'Gold 1', rr: 60, elo: 1260 },
]
const render = (props: Record<string, unknown>) => renderToString(vue.createSSRApp({ render: () => vue.h(RankJourney, props) }))

describe('RankJourney', () => {
  it('shows the rank change, the rating delta from ELO and one coach sentence', async () => {
    const html = await render({ history })
    expect(html).toContain('Silver 3 → Gold 1')
    expect(html).toContain('+70')
    expect(html).toContain('Your rating is up 70 over the last 19 days, from Silver 3 to Gold 1.')
    expect(html).toContain('competitivetiers') // rank icons
    expect(html).not.toContain('Focus started')
    expect(html).toContain('Ranked up')
    expect(html).not.toContain('Ranked down')
  })
  it('marks the focus start only when it falls inside the window', async () => {
    expect(await render({ history, focusStartedAt: '2026-10-10T00:00:00Z', focusLabel: 'Opening deaths' })).toContain('Focus started<!--[-->: Opening deaths')
    expect(await render({ history, focusStartedAt: '2026-09-01T00:00:00Z', focusLabel: 'Opening deaths' })).not.toContain('Focus started')
  })
  it('draws one badge per rank reached, not one per flip, and keeps the focus label out of the plot', async () => {
    const flips = ['Platinum 1', 'Platinum 2', 'Platinum 1', 'Platinum 2', 'Platinum 1', 'Platinum 2'].map((rank, i) => ({ date: `2026-10-${10 + i * 3}T12:00:00Z`, rank, rr: 0, elo: 1200 + (i % 2) * 50 }))
    const html = await render({ history: flips, focusStartedAt: '2026-10-15T00:00:00Z', focusLabel: 'Opening deaths' })
    expect(html.match(/<image /g)).toHaveLength(2)
    expect(html.match(/<circle [^>]*r="7"/g)).toHaveLength(5)
    expect(html).not.toMatch(/<text[^>]*>Focus/)
  })
  it('uses the loss colour when the rating falls', async () => {
    const html = await render({ history: [...history].map((x, i) => ({ ...x, elo: 1300 - i * 40 })) })
    expect(html).toContain('-80')
    expect(html).toContain('var(--uf-loss)')
    expect(html).not.toContain('var(--uf-win)')
  })
})
