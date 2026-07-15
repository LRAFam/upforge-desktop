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

  it('ignores PREGAME so agent select back-out does not end the wait', () => {
    const prev = { sawIngame: true, lastLoop: 'INGAME' }
    const result = applyMenuWatchTick(prev, 'PREGAME')
    expect(result.returnedToMenus).toBe(false)
    expect(result.state).toEqual(prev)
  })
})
