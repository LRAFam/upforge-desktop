import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { compileScript, parse } from '@vue/compiler-sfc'
import ts from 'typescript'
import * as vue from 'vue'
import { describe, expect, it } from 'vitest'
import { renderToString } from 'vue/server-renderer'
import * as gameData from './game-data'

// Compile SFCs by hand, as the other component tests do (no Vite Vue plugin in vitest).
function compile(file: string) {
  const { descriptor } = parse(readFileSync(new URL(file, import.meta.url), 'utf8'))
  return compileScript(descriptor, { id: `games-${file}`, inlineTemplate: true })
}

const stub = (tag: string) => vue.defineComponent({ props: ['variant', 'disabled', 'game', 'label'], setup: (p, { slots }) => () => vue.h(tag, { 'data-variant': p.variant, 'data-label': p.label }, slots.default?.()) })

function loadSetup() {
  const code = ts.transpileModule(compile('./GameSetup.vue').content, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports: any = {}
  const mods: Record<string, unknown> = { vue, '../UfButton.vue': { default: stub('button') }, './GameMark.vue': { default: stub('header') }, './game-data': gameData }
  vm.runInNewContext(code, { exports, require: (id: string) => { if (id in mods) return mods[id]; throw new Error(`Unexpected import: ${id}`) } })
  return exports.default
}

describe('GameSetup', () => {
  const GameSetup = loadSetup()
  const render = (props: Record<string, unknown>) => renderToString(vue.createSSRApp({ render: () => vue.h(GameSetup, props) }))

  it('shows what is missing, three numbered steps and exactly one primary action', async () => {
    const setup = gameData.cs2Setup(null, null)
    const html = await render({ game: 'cs2', setup })
    expect(html).toContain('aria-label="Set up CS2"')
    expect(html).toContain(setup.missing)
    expect(html.match(/class="uf-d3 gset-n"/g)).toHaveLength(3)
    expect(html).toContain('>01<')
    expect(html.match(/data-variant="primary"/g)).toHaveLength(1)
    expect(html).toContain('Set Steam name')
    expect(html).toContain('rich match stats')
  })

  it('marks done steps and shows a detect error', async () => {
    const html = await render({ game: 'cs2', setup: gameData.cs2Setup({ identity: { steam_display_name: 'a', steam_id: null, linked: true }, valve_stats: { matches_tracked: 0, avg_kd: null, premier_rating: null, map_breakdown: [] } }, null), error: 'Could not find CS2.' })
    expect(html).toContain('is-done')
    expect(html).toContain('Detect demo folder')
    expect(html).toContain('role="alert"')
  })

  it('League has no demo note', async () => {
    const html = await render({ game: 'lol', setup: gameData.lolSetup(false) })
    expect(html).toContain('Link Riot')
    expect(html).not.toContain('rich match stats')
  })
})

describe('game SFCs compile', () => {
  for (const f of ['./GameMark.vue', './GameHomeSummary.vue', './GameFiles.vue', './GameProgress.vue']) {
    it(f, () => { expect(compile(f).content.length).toBeGreaterThan(0) })
  }
})
