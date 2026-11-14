/**
 * Mounts the real "Your focuses" section with a fake app bridge: what a player sees with several
 * focuses, and what adding (suggested or own target) and dropping actually send.
 */
import * as vue from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FocusItem, FocusOption, FocusesResult, FocusesState } from '../../../lib/focuses'
import { findAll, mountSfc, press, pressable, settle, typeInto, unmountAll } from '../../../test-support/sfc-mount'

let nextGame = 0
/** A fresh game key per test keeps the screen cache from leaking between cases. */
const freshGame = (): string => (['valorant', 'lol', 'deadlock'] as const)[nextGame++ % 3]

function focus(over: Partial<FocusItem> = {}): FocusItem {
  return {
    id: 1, metric: 'opening_death_rate', label: 'Opening deaths', better: 'lower', baseline: 0.4, target: 0.24,
    unit: 'share_of_rounds', checks: [], status: 'active', origin: 'coach', started_at: null, completed_at: null,
    progress: { games_played: 0, hits: 0, games_required: 3, hits_required: 2, status: 'active' }, ...over,
  }
}
const traded: FocusOption = { metric: 'traded_death_rate', label: 'Deaths traded', better: 'higher', unit: 'share_of_deaths', current: 0.2,
  matches: 5, target: 0.35, target_text: 'Deaths traded: at least 35% of deaths over your next 3 games' }

function stateOf(over: Partial<FocusesState> = {}): FocusesState {
  return { game: 'valorant', max_active: 3, focuses: [focus()], options: [traded], recent: [], ...over }
}

interface Setup {
  list: FocusesResult
  add?: (game: string, metric: string, target: number | null) => FocusesResult
  drop?: (id: number) => FocusesResult
  props?: Record<string, unknown>
  fallback?: string
}
async function mountFocuses(setup: Setup) {
  const game = freshGame()
  const addFocus = vi.fn(async (g: string, metric: string, target: number | null) => setup.add?.(g, metric, target) ?? { ok: false as const, error: 'unavailable' })
  const dropFocus = vi.fn(async (id: number) => setup.drop?.(id) ?? { ok: false as const, error: 'unavailable' })
  const listFocuses = vi.fn(async () => setup.list)
  const changed = vi.fn()
  vi.stubGlobal('document', { activeElement: null })
  vi.stubGlobal('window', { api: { app: { listFocuses, addFocus, dropFocus, onFocusUpdated: () => () => {} } } })
  const screen = await mountSfc(new URL('./FocusesV3.vue', import.meta.url), {
    props: { game, onChanged: changed, ...setup.props },
    slots: setup.fallback ? { fallback: () => vue.h('p', setup.fallback) } : undefined,
  })
  return { ...screen, game, addFocus, dropFocus, listFocuses, changed }
}

afterEach(() => {
  unmountAll()
  vi.unstubAllGlobals()
})

describe('FocusesV3', () => {
  it('lists every focus with its goal, progress and who chose it', async () => {
    const screen = await mountFocuses({
      list: { ok: true, ...stateOf({ focuses: [
        focus({ progress: { games_played: 1, hits: 1, games_required: 3, hits_required: 2, status: 'active' }, checks: [{ match_id: 'm1', value: 0.1, hit: true, played_at: null }] }),
        focus({ id: 2, metric: 'deaths', label: 'Deaths per game', target: 5.1, unit: 'count', origin: 'player' }),
      ] }) },
    })
    const text = screen.text()
    expect(text).toContain('Your focuses 2 of 3 in use')
    expect(text).toContain('Opening deaths At most 24% of rounds')
    expect(text).toContain('On target in 1 of 1 so far · 2 games left')
    expect(text).toContain('From your coach')
    expect(text).toContain('Deaths per game At most 5.1')
    expect(text).toContain('Your pick')
    expect(screen.listFocuses).toHaveBeenCalledWith(screen.game)
  })

  it('leaves out the newest focus when the screen already shows it in detail', async () => {
    const screen = await mountFocuses({
      list: { ok: true, ...stateOf({ focuses: [focus(), focus({ id: 2, label: 'Deaths traded', metric: 'traded_death_rate' })], options: [] }) },
      props: { skipNewest: true, heading: 'More focuses' },
    })
    expect(screen.text()).toContain('More focuses 2 of 3 in use')
    expect(screen.text()).toContain('Opening deaths')
    expect(screen.text()).not.toContain('Deaths traded')
  })

  it('adds a focus with the suggested target', async () => {
    const after = stateOf({ focuses: [focus(), focus({ id: 2, label: 'Deaths traded', metric: 'traded_death_rate', better: 'higher', target: 0.35, unit: 'share_of_deaths', origin: 'player' })], options: [] })
    const screen = await mountFocuses({ list: { ok: true, ...stateOf() }, add: () => ({ ok: true, ...after }) })
    expect(screen.text()).not.toContain('Now 20% of deaths')

    press(screen.root, 'Add a focus')
    await settle()
    expect(screen.text()).toContain('Deaths traded Now 20% of deaths, aim for at least 35%')
    press(screen.root, 'Add')
    await settle()

    expect(screen.addFocus.mock.calls).toEqual([[screen.game, 'traded_death_rate', null]])
    expect(screen.text()).toContain('Your focuses 2 of 3 in use')
    expect(screen.text()).toContain('Deaths traded At least 35% of deaths')
    expect(screen.text()).not.toContain('Pick what to work on')
    expect(screen.changed).toHaveBeenCalledTimes(1)
  })

  it('adds a focus with the player’s own target, and refuses one that is no improvement', async () => {
    const screen = await mountFocuses({ list: { ok: true, ...stateOf() }, add: () => ({ ok: true, ...stateOf({ options: [] }) }) })
    press(screen.root, 'Add a focus')
    await settle()
    press(screen.root, 'Set my own target')
    await settle()
    const input = findAll(screen.root, n => n.type === 'input')[0]!
    expect(input.value).toBe('35')
    const form = findAll(screen.root, n => n.type === 'form')[0]!
    const submit = (): void => { (form.props.onSubmit as (e: unknown) => void)({ preventDefault() {} }) }

    typeInto(input, '10') // below the current 20% on a higher-is-better habit
    submit()
    await settle()
    expect(screen.addFocus).not.toHaveBeenCalled()
    expect(screen.text()).toContain('Type a number that is higher than where you are now.')

    typeInto(input, '30')
    submit()
    await settle()
    expect(screen.addFocus.mock.calls).toEqual([[screen.game, 'traded_death_rate', 0.3]])
  })

  it('drops a focus only after the player confirms', async () => {
    const screen = await mountFocuses({
      list: { ok: true, ...stateOf() },
      drop: () => ({ ok: true, ...stateOf({ focuses: [], recent: [focus({ status: 'replaced' })] }) }),
      props: { showRecent: true },
    })
    press(screen.root, 'Drop')
    await settle()
    expect(screen.text()).toContain('Drop this focus?')
    press(screen.root, 'Keep it')
    await settle()
    expect(screen.dropFocus).not.toHaveBeenCalled()

    press(screen.root, 'Drop')
    await settle()
    press(screen.root, 'Yes, drop it')
    await settle()
    expect(screen.dropFocus.mock.calls).toEqual([[1]])
    expect(screen.text()).toContain('Your focuses 0 of 3 in use')
    expect(screen.text()).toContain('Recently ended Opening deaths Dropped before a game counted')
    expect(screen.changed).toHaveBeenCalledTimes(1)
  })

  it('says why the server refused, in plain words', async () => {
    const screen = await mountFocuses({ list: { ok: true, ...stateOf() }, add: () => ({ ok: false, error: 'limit_reached', state: stateOf() }) })
    press(screen.root, 'Add a focus')
    await settle()
    press(screen.root, 'Add')
    await settle()
    expect(screen.text()).toContain('Drop one first.')
    expect(screen.changed).not.toHaveBeenCalled()
  })

  it('explains the limit instead of offering to add when the player is at it', async () => {
    const screen = await mountFocuses({ list: { ok: true, ...stateOf({ focuses: [focus(), focus({ id: 2 }), focus({ id: 3 })] }) } })
    expect(screen.text()).toContain('You can work on 3 at once. Drop one to add another.')
    expect(pressable(screen.root, 'Add a focus')).toBeUndefined()
  })

  it('shows the screen’s older focus block when the server has no focus list', async () => {
    const screen = await mountFocuses({ list: { ok: false, error: 'unavailable' }, fallback: 'Your focus (older block)' })
    expect(screen.text()).toBe('Your focus (older block)')
  })
})
