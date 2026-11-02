import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { compileScript, parse } from '@vue/compiler-sfc'
import ts from 'typescript'
import * as vue from 'vue'
import { describe, expect, it } from 'vitest'
import { renderToString } from 'vue/server-renderer'
import * as emptyArt from './empty-art'
import { normalizeEmptyArtGame, pickEmptyArt, valorantAgentPortrait, valorantMapBackdrop } from './empty-art'

const primaryGame = vue.ref('valorant')

// Compile the SFC by hand, as the other component tests in this repo do (no Vite Vue plugin in vitest).
function loadEmptyArt() {
  const { descriptor } = parse(readFileSync(new URL('./EmptyArt.vue', import.meta.url), 'utf8'))
  const script = compileScript(descriptor, { id: 'empty-art-test', inlineTemplate: true })
  const code = ts.transpileModule(script.content, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports: any = {}
  const modules: Record<string, unknown> = {
    vue,
    './empty-art': emptyArt,
    '../../../composables/usePrimaryGame': { usePrimaryGame: () => ({ primaryGame }) },
  }
  vm.runInNewContext(code, { exports, require: (id: string) => { if (id in modules) return modules[id]; throw new Error(`Unexpected import: ${id}`) } })
  return exports.default
}
const EmptyArt = loadEmptyArt()
const render = (props: Record<string, unknown>, slot?: () => vue.VNode) =>
  renderToString(vue.createSSRApp({ render: () => vue.h(EmptyArt, props, slot ? { default: slot } : undefined) }))

describe('pickEmptyArt', () => {
  it('uses each game’s own bundled art', () => {
    const arts = (['valorant', 'cs2', 'deadlock', 'lol'] as const).map(g => pickEmptyArt({ game: g }))
    expect(arts.every(a => a.kind === 'game' && a.agent === null && a.backdrop)).toBe(true)
    expect(new Set(arts.map(a => a.backdrop)).size).toBe(4)
    expect(arts[0].backdrop).toContain('hero-agents')
    expect(arts[1].backdrop).toContain('cs2-card-bg')
    expect(arts[2].backdrop).toContain('deadlock-card-bg')
    expect(arts[3].backdrop).toContain('lol-card-bg')
  })

  it('falls back to Valorant for unknown games and maps League aliases', () => {
    expect(normalizeEmptyArtGame(null)).toBe('valorant')
    expect(normalizeEmptyArtGame('league')).toBe('lol')
    expect(normalizeEmptyArtGame('CS2')).toBe('cs2')
  })

  it('prefers a Valorant map’s stylized background over game art', () => {
    const pick = pickEmptyArt({ game: 'valorant', map: 'Ascent' })
    expect(pick.kind).toBe('map')
    expect(pick.backdrop).toBe('https://media.valorant-api.com/maps/7eaecc1b-4337-bbf6-6ab9-04b8f06b3319/stylizedbackgroundimage.png')
  })

  it('ignores Valorant map/agent names on other games', () => {
    const pick = pickEmptyArt({ game: 'cs2', map: 'Ascent', agent: 'Jett' })
    expect(pick).toEqual({ backdrop: expect.stringContaining('cs2-card-bg'), agent: null, kind: 'game' })
  })

  it('adds an agent portrait over the abstract art, not over the five-agent splash', () => {
    const pick = pickEmptyArt({ game: 'valorant', agent: 'Reyna' })
    expect(pick.agent).toBe('https://media.valorant-api.com/agents/a3bfb853-43b2-7238-a4f1-ad90e9e46bcc/fullportrait.png')
    expect(pick.backdrop).toContain('valorant-card-bg')
  })

  it('lets an explicit art override win', () => {
    expect(pickEmptyArt({ game: 'deadlock', art: '/podium.webp' })).toEqual({ backdrop: '/podium.webp', agent: null, kind: 'art' })
  })

  it('returns empty strings for unknown maps and agents', () => {
    expect(valorantMapBackdrop('Not a map')).toBe('')
    expect(valorantAgentPortrait('Nobody')).toBe('')
    expect(pickEmptyArt({ game: 'valorant', map: 'Not a map' }).kind).toBe('game')
  })
})

describe('EmptyArt', () => {
  it('renders title, text and the one action', async () => {
    const html = await render({ title: 'No clips on this PC yet', text: 'Press F9 during a match.' }, () => vue.h('button', { type: 'button' }, 'Browse cloud clips'))
    expect(html).toContain('class="uf-t1 uf-ea-title"')
    expect(html).toContain('No clips on this PC yet')
    expect(html).toContain('Press F9 during a match.')
    expect(html).toMatch(/<div class="uf-ea-act">(<!--\[-->)?<button type="button">Browse cloud clips<\/button>/)
    expect(html).toContain('aria-hidden="true" class="uf-ea-art"')
  })

  it('uses a T3 title for a section and omits empty text and action', async () => {
    const html = await render({ title: 'No scores yet', size: 'section' })
    expect(html).toContain('is-section')
    expect(html).toContain('class="uf-t3 uf-ea-title"')
    expect(html).not.toContain('uf-ea-text')
    expect(html).not.toContain('uf-ea-act')
  })

  it('picks art by the given game, else the title-bar game', async () => {
    expect(await render({ title: 'x', game: 'deadlock' })).toMatch(/src="[^"]*deadlock-card-bg[^"]*"/)
    primaryGame.value = 'lol'
    expect(await render({ title: 'x' })).toMatch(/src="[^"]*lol-card-bg[^"]*"/)
    primaryGame.value = 'valorant'
  })

  it('shows an agent cut-out only when an agent is known', async () => {
    const html = await render({ title: 'x', game: 'valorant', agent: 'Jett' })
    expect(html).toContain('has-agent')
    expect(html).toContain('fullportrait.png')
    expect(await render({ title: 'x', game: 'valorant' })).not.toContain('uf-ea-agent')
  })
})
