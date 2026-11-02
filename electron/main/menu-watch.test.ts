import { describe, expect, it } from 'vitest'
import { applyMenuWatchTick } from './menu-watch'

describe('applyMenuWatchTick', () => {
  it('does not treat missing session state as MENUS (avoids re-arm mid-match)', () => {
    const prev = { sawIngame: true, lastLoop: 'INGAME' }
    const result = applyMenuWatchTick(prev, null)
    expect(result.returnedToMenus).toBe(false)
    expect(result.state).toEqual(prev)
  })

  it('fires only after a real INGAME → MENUS transition', () => {
    let state = { sawIngame: false, lastLoop: null as string | null }
    state = applyMenuWatchTick(state, 'MENUS').state
    expect(applyMenuWatchTick(state, 'MENUS').returnedToMenus).toBe(false)

    state = applyMenuWatchTick(state, 'INGAME').state
    expect(state.sawIngame).toBe(true)

    const done = applyMenuWatchTick(state, 'MENUS')
    expect(done.returnedToMenus).toBe(true)
  })

  it('does not end the wait on a single PREGAME reading', () => {
    const prev = { sawIngame: true, lastLoop: 'INGAME' }
    const result = applyMenuWatchTick(prev, 'PREGAME')
    expect(result.returnedToMenus).toBe(false)
    expect(result.state.lastLoop).toBe('INGAME')
  })

  it('ignores PREGAME before any INGAME', () => {
    const prev = { sawIngame: false, lastLoop: 'MENUS' }
    expect(applyMenuWatchTick(applyMenuWatchTick(prev, 'PREGAME').state, 'PREGAME').returnedToMenus).toBe(false)
  })

  // 2 Nov 2026: Range skipped (INGAME) → queued from the Range → Swiftplay agent select → Swiftplay INGAME.
  // MENUS never appeared until Swiftplay ended, so the Swiftplay match was never recorded.
  it('ends the wait when the player goes from a skipped match straight into the next agent select', () => {
    let state = applyMenuWatchTick({ sawIngame: false, lastLoop: null }, 'INGAME').state
    let r = applyMenuWatchTick(state, 'PREGAME')
    expect(r.returnedToMenus).toBe(false)
    state = r.state
    r = applyMenuWatchTick(state, 'PREGAME')
    expect(r.returnedToMenus).toBe(true)
  })

  it('a PREGAME blip between INGAME polls does not add up across the match', () => {
    let state = applyMenuWatchTick({ sawIngame: false, lastLoop: null }, 'INGAME').state
    state = applyMenuWatchTick(state, 'PREGAME').state
    state = applyMenuWatchTick(state, 'INGAME').state
    expect(applyMenuWatchTick(state, 'PREGAME').returnedToMenus).toBe(false)
  })

  it('still ends on MENUS after one PREGAME reading', () => {
    let state = applyMenuWatchTick({ sawIngame: false, lastLoop: null }, 'INGAME').state
    state = applyMenuWatchTick(state, 'PREGAME').state
    expect(applyMenuWatchTick(state, 'MENUS').returnedToMenus).toBe(true)
  })
})
