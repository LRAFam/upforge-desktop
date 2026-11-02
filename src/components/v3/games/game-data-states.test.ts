import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { compileScript, parse } from '@vue/compiler-sfc'
import ts from 'typescript'
import * as vue from 'vue'
import { describe, expect, it } from 'vitest'
import { renderToString } from 'vue/server-renderer'
import * as lolRecent from '../../../lib/lol-recent'
import * as itemBuild from '../../../lib/deadlock-item-build'

// Same hand-compile harness as GameSetup.test.ts (no Vite Vue plugin in vitest).
function load(file: string, mods: Record<string, unknown>) {
  const { descriptor } = parse(readFileSync(new URL(file, import.meta.url), 'utf8'))
  const code = ts.transpileModule(compileScript(descriptor, { id: `states-${file}`, inlineTemplate: true }).content, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const exports: Record<string, unknown> = {}
  const all: Record<string, unknown> = { vue, ...mods }
  vm.runInNewContext(code, { exports, require: (id: string) => { if (id in all) return all[id]; throw new Error(`Unexpected import: ${id}`) } })
  return exports.default as vue.Component
}
const render = (c: vue.Component, props: Record<string, unknown>) => renderToString(vue.createSSRApp({ render: () => vue.h(c, props) }))

describe('LolRecentNotice', () => {
  const Notice = load('./LolRecentNotice.vue', { '../../../lib/lol-recent': lolRecent })

  it('Riot down with nothing listed: says so with the reason and a retry, never "no games"', async () => {
    const state = lolRecent.normalizeLolRecent({ matches: [], error: 'riot_unavailable', error_reason: 'riot_down' })
    const html = await render(Notice, { state, hasMatches: false })
    expect(html).toContain('Couldn’t reach Riot right now')
    expect(html).toContain('match service is having problems')
    expect(html).toContain('Try again')
    expect(html).toContain('role="alert"')
    expect(html).not.toMatch(/No .*games found/)
  })

  it('Riot down with older games on screen: one line', async () => {
    const html = await render(Notice, { state: { error: 'riot_unavailable', errorReason: 'rate_limited', partial: false }, hasMatches: true })
    expect(html).toContain('Showing your games from earlier')
  })

  it('partial list: one quiet line; complete list: nothing', async () => {
    expect(await render(Notice, { state: { error: null, errorReason: null, partial: true }, hasMatches: true })).toContain('Some of your games')
    expect(await render(Notice, { state: null, hasMatches: true })).toBe('<!--v-if-->')
  })
})

describe('LolLoadoutStrip', () => {
  const Strip = load('./LolLoadoutStrip.vue', { '../../../lib/lol-recent': lolRecent })
  it('renders spells, items and the trinket last; nothing on older API rows', async () => {
    const html = await render(Strip, { match: { items: [3089, 0, 0, 0, 0, 0, 3340], summoner_spells: [4, 12] } })
    expect(html).toContain('SummonerFlash.png')
    expect(html.indexOf('3089.png')).toBeLessThan(html.indexOf('3340.png'))
    expect(html).toContain('class="lls-trinket"')
    expect(await render(Strip, { match: { champion: 'Ahri' } })).toBe('<!--v-if-->')
  })
})

describe('DeadlockItemBuildV3', () => {
  const Build = load('./DeadlockItemBuildV3.vue', { '../../../lib/deadlock-item-build': itemBuild })
  it('shows icons in buy order with times and marks sells', async () => {
    const steps = itemBuild.deadlockItemBuild([
      { item_id: 2, name: 'Extra Stamina', icon: 'https://assets-bucket.deadlock-api.com/i2.png', slot: 'vitality', bought_at_sec: 245, sold_at_sec: null },
      { item_id: 1, name: 'Basic Magazine', icon: null, slot: 'weapon', bought_at_sec: 130, sold_at_sec: 1450 },
    ])
    const html = await render(Build, { steps })
    expect(html.indexOf('2:10')).toBeLessThan(html.indexOf('4:05'))
    expect(html).toContain('sold 24:10')
    expect(html).toContain('is-sold')
    expect(html).toContain('2 items bought · 1 sold')
  })
  it('honest empty states', async () => {
    expect(await render(Build, { steps: null })).toContain('didn’t publish the item list')
    expect(await render(Build, { steps: [] })).toContain('No items bought')
  })
})
